"""
Interview Service
Handles AI interview logic including prompt generation, Groq API calls, and TTS.
"""

import os
import base64
import json
import logging
import re
import time
import weakref
from typing import Iterator, List, Dict, Optional, Tuple
import httpx
from groq import Groq
from deepgram import DeepgramClient, SpeakOptions

logger = logging.getLogger(__name__)

# Model is a reasoning model: without an explicit effort it burns hundreds of
# hidden thinking tokens before the first visible one. Interview turns are three
# sentences, so "low" is all we need.
CHAT_MODEL = "openai/gpt-oss-120b"
CHAT_REASONING_EFFORT = "low"

# Reasoning tokens count against the completion budget, so this ceiling covers
# thinking + the spoken answer. It is a cap, not a target - raising it does not
# slow anything down, but setting it too low truncates real answers.
CHAT_MAX_COMPLETION_TOKENS = 800

# Prefill time scales with input size, and these two are pasted by the user, so
# they are the only unbounded part of the prompt.
MAX_RESUME_CHARS = 6000
MAX_JOB_DESCRIPTION_CHARS = 4000

# MP3 instead of WAV: Aura linear16 is ~48KB per second of speech and base64
# inflates it another 33%, so a 15s answer was shipping ~950KB of JSON.
#
# Model is overridable because Deepgram's aura-2 line is generally faster than
# aura-1; swapping it changes the voice, so it stays opt-in via the environment.
TTS_MODEL = os.getenv("TTS_MODEL", "aura-asteria-en")
TTS_ENCODING = "mp3"
TTS_BIT_RATE = 48000
TTS_MIME_TYPE = "audio/mpeg"
TTS_URL = "https://api.deepgram.com/v1/speak"

# Deepgram synthesizes progressively, so the first bytes land in well under a
# second while the tail of a long answer takes several more. Anything larger
# than one chunk here just delays playback for no reason.
TTS_CHUNK_BYTES = 4096

# /speak is reachable from the browser, so the text it will synthesize is capped.
MAX_SPEECH_CHARS = 2000


def _truncate(text: str, limit: int, label: str) -> str:
    """Cap pasted free text so one oversized paste cannot inflate every turn."""
    if not text or len(text) <= limit:
        return text

    logger.info("Truncating %s from %d to %d chars", label, len(text), limit)
    return text[:limit].rstrip() + "\n[...truncated]"


class InterviewService:

    # Flipped off permanently if the API ever rejects the reasoning parameter,
    # so a model swap degrades to a slower call instead of a broken interview.
    _supports_reasoning_effort = True

    def __init__(self, groq_api_key: Optional[str] = None, deepgram_api_key: Optional[str] = None):

        self.groq_api_key = groq_api_key or os.getenv("GROQ_API_KEY")
        self.deepgram_api_key = deepgram_api_key or os.getenv("DEEPGRAM_API_KEY")
        
        if not self.groq_api_key:
            raise ValueError("GROQ_API_KEY not found in environment")
        if not self.deepgram_api_key:
            raise ValueError("DEEPGRAM_API_KEY not found in environment")
        
        self.groq_client = Groq(api_key=self.groq_api_key)
        self.deepgram_client = DeepgramClient(api_key=self.deepgram_api_key)
        self.candidate_name = None
    
    def determine_phase(self, messages: List[Dict[str, str]]) -> str:
        assistant_count = sum(1 for msg in messages if msg.get("role") == "assistant")
        
        if assistant_count <= 1:
            return "INTRODUCTION"
        elif assistant_count <= 4:
            return "TECHNICAL"
        elif assistant_count <= 7:
            return "BEHAVIORAL"
        else:
            return "WRAP_UP"
    
    def build_interview_system_prompt(
        self, 
        job_description: str, 
        resume_text: str, 
        candidate_name: str,
        difficulty: str = "medium",
        phase: str = "INTRODUCTION"
    ) -> str:

        
        difficulty_instructions = {
            "easy": """
                **EASY MODE - Foundational & Encouraging**
                - Focus on DEFINITIONS and BASIC CONCEPTS (e.g., "What is a class?", "What is an API?")
                - Ask about HIGH-LEVEL understanding without deep implementation details
                - Include SOFT SKILLS questions (teamwork, communication, work style)
                - Be ENCOURAGING and supportive in your responses
                - Examples: "What does OOP mean?", "How do you handle feedback?", "Tell me about a time you worked in a team"
                - Avoid: System design, optimization, trade-offs, complex algorithms
                """,
            "medium": """
                **MEDIUM MODE - Implementation & Practical Experience**
                - Focus on IMPLEMENTATION DETAILS and real-world scenarios
                - Ask about STANDARD PATTERNS and best practices (e.g., "How do you handle API errors?", "Explain your approach to testing")
                - Explore TRADE-OFFS between different solutions
                - Ask for CONCRETE EXAMPLES from past experience
                - Examples: "How would you structure a REST API?", "What's your debugging process?", "Explain async/await"
                - Balance: Some theory, mostly practical application
                """,
            "hard": """
                **HARD MODE - System Design & Deep Expertise**
                - Focus on SYSTEM DESIGN and SCALABILITY (e.g., "How would you scale this for 1M users?")
                - Ask about EDGE CASES, failure scenarios, and performance bottlenecks
                - Explore OPTIMIZATION strategies (time/space complexity, caching, sharding)
                - CHALLENGE ASSUMPTIONS - make them defend their architectural decisions
                - Examples: "Design a URL shortener at scale", "How would you handle eventual consistency?", "Optimize this for 10k requests/sec"
                - Expect: Deep technical knowledge, real production experience, trade-off analysis
                """
        }
        
        diff_instruction = difficulty_instructions.get(difficulty.lower(), difficulty_instructions["medium"])
        
        phase_instructions = {
            "INTRODUCTION": """
                **CURRENT PHASE: INTRODUCTION**

                **YOUR IMMEDIATE GOAL:**
                - Warmly welcome {candidate_name} to the interview
                - Keep it BRIEF (1-2 sentences max)
                - Ask them to introduce themselves and briefly describe their background
                - DO NOT ask technical questions yet - save those for the next phase

                **Example Response:**
                "Hi {candidate_name}, thanks for joining me today. Could you tell me a bit about yourself and your background?"

                **CONSTRAINTS:**
                - Keep your response under 2 sentences
                - Focus ONLY on getting their introduction
                - Be warm but professional
                """,
            "TECHNICAL": """
                **CURRENT PHASE: TECHNICAL DEEP DIVE**

                **YOUR IMMEDIATE GOAL:**
                - Pick ONE specific skill from their resume (e.g., Python, React, AWS, etc.)
                - Ask a HARD, SPECIFIC technical question about that skill
                - Do NOT accept vague answers - probe for details
                - Focus on implementation, not just theory

                **What to Cover:**
                - Architecture decisions
                - Code quality and best practices  
                - Problem-solving approach
                - Real-world experience with the technology

                **Example Questions:**
                - "I see you used React - how do you handle state management in large applications?"
                - "You mentioned Python - explain your approach to async programming and when you'd use it"
                - "Tell me about a time you had to optimize database queries. What was your approach?"

                **CONSTRAINTS:**
                - ONE question at a time
                - Make it specific to their resume
                - Challenge weak or vague answers
                - Stay in technical territory - NO behavioral questions yet
                """,
            "BEHAVIORAL": """
                **CURRENT PHASE: BEHAVIORAL & SOFT SKILLS**

                **YOUR IMMEDIATE GOAL:**
                - Shift from technical to behavioral questions
                - Assess team fit, communication, and work style
                - Focus on real situations and examples

                **What to Cover:**
                - Teamwork and collaboration
                - Handling conflict or pressure
                - Communication with non-technical stakeholders
                - Learning from failures
                - Leadership or mentorship

                **Example Questions:**
                - "Tell me about a time you disagreed with a team member. How did you handle it?"
                - "Describe a situation where you had to explain a complex technical concept to a non-technical person"
                - "What's a project that didn't go as planned? What did you learn?"

                **CONSTRAINTS:**
                - ONE question at a time
                - Ask for SPECIFIC examples (use STAR format mentally)
                - NO more technical questions - you're assessing personality and fit now
                - Listen for communication skills and self-awareness
                """,
            "WRAP_UP": """
                **CURRENT PHASE: CONCLUSION**

                **YOUR IMMEDIATE GOAL:**
                - Start wrapping up the interview
                - Thank {candidate_name} for their time
                - Ask if they have any questions for you
                - Provide brief, positive feedback
                - End the interview gracefully

                **What to Say:**
                1. "Thank you for your time today, {candidate_name}. You shared some great insights."
                2. "Before we wrap up - do you have any questions for me about the role or the team?"
                3. After their response (or if none): "Great! We'll be in touch soon. Thanks again and have a great day!"

                **CONSTRAINTS:**
                - Keep it SHORT and professional
                - Be positive (save critical feedback for the written report)
                - DO NOT ask more interview questions
                - Make them feel good about the experience
                - Signal clearly that the interview is ending
                """
        }
        
        phase_instruction = phase_instructions.get(phase, phase_instructions["INTRODUCTION"]).replace("{candidate_name}", candidate_name)
        
        return f"""
                You are a **Senior Hiring Manager** conducting a professional technical interview for a software engineering role.

                === JOB DESCRIPTION ===
                {job_description}

                === CANDIDATE RESUME ===
                {resume_text}

                === YOUR ROLE & RESPONSIBILITIES ===
                You are evaluating {candidate_name} for this position. Act professionally, analytically, and strategically.

                === CRITICAL INSTRUCTIONS ===

                1. **PROFESSIONAL CONDUCT**
                - Address the candidate as {candidate_name} occasionally to maintain rapport
                - Maintain a professional yet conversational tone
                - Be respectful but evaluative - you're assessing fit for the role

                2. **QUESTION STRATEGY**
                - Ask **ONE question at a time** - never list multiple questions
                - **NEVER repeat a question** you've already asked
                - Review the conversation history carefully before asking
                - If you've covered a topic, move to a different area

                3. **DYNAMIC FOLLOW-UPS**
                - **ALWAYS read the candidate's previous answer** before responding
                - Ask relevant follow-up questions based on their specific answer
                - If they mention a technology/project, dig deeper into it
                - If their answer is vague, ask for concrete examples
                - If their answer is strong, probe edge cases or advanced scenarios

                4. **DIFFICULTY LEVEL: {difficulty.upper()}**
                {diff_instruction}

                5. **RESPONSE FORMAT**
                - Keep responses under 3 sentences (will be spoken aloud)
                - Start by reacting to their answer ("That's interesting...", "I see...", "Good point...")
                - Then ask your next question naturally

                6. **INTERVIEW FLOW**
                - If this is the start, warmly ask them to introduce themselves
                - Cover: background, technical skills, problem-solving, behavioral questions
                - Adapt based on their resume and the job requirements
                - Progress logically through topics - don't jump randomly

                7. **EVALUATION MINDSET**
                - You're not just asking questions - you're assessing competency
                - Listen for: clarity, depth of knowledge, communication skills
                - Challenge weak answers politely
                - Acknowledge strong answers but keep probing

                8. **NAME FIDELITY**
                - The candidate's official name is **{candidate_name}**
                - Speech-to-text may generate phonetic errors (e.g., 'Raheem' instead of 'Zayeem')
                - You must ALWAYS use **{candidate_name}**
                - If the transcript shows a different but similar-sounding name, assume it is a typo and ignore it

                9. **NO META-TEXT**
                    - Do NOT include placeholder text like '*Awaiting response*', '[End of turn]', or any actions in asterisks
                    - Only output the spoken response content without UI cues or status markers

                **Remember:** You have full conversation history. Use it to create a coherent, adaptive interview experience.

                {phase_instruction}

                ⚠️ **CRITICAL:** The CURRENT PHASE instruction above takes ABSOLUTE PRIORITY. Follow it strictly to maintain interview flow.
            """
    
    def generate_interview_response(
        self,
        resume_text: str,
        job_description: str,
        candidate_name: str,
        messages: List[Dict[str, str]],
        difficulty: str = "medium"
    ) -> str:

        self.candidate_name = candidate_name

        # Extract first name only for natural conversation
        first_name = candidate_name.split()[0] if candidate_name else "Candidate"

        phase = self.determine_phase(messages)

        system_prompt = self.build_interview_system_prompt(
            _truncate(job_description, MAX_JOB_DESCRIPTION_CHARS, "job description"),
            _truncate(resume_text, MAX_RESUME_CHARS, "resume"),
            first_name,
            difficulty,
            phase,
        )
        
        api_messages_copy = messages.copy()
        if api_messages_copy and api_messages_copy[-1].get("role") == "user":
            original_content = api_messages_copy[-1]["content"]
            api_messages_copy[-1] = {
                "role": "user",
                "content": f"[System verified name: {first_name}] {original_content}"
            }
        
        api_messages = [{"role": "system", "content": system_prompt}] + api_messages_copy
        
        try:
            completion = self._create_chat_completion(api_messages)

            raw_response = completion.choices[0].message.content
            return self._clean_response_text(raw_response)

        except Exception as e:
            raise Exception(f"Groq API call failed: {str(e)}")

    def _create_chat_completion(self, api_messages: List[Dict[str, str]]):
        """
        Run the interview-turn completion, logging where Groq spent its time.

        Falls back to a plain call if the deployed model does not accept
        reasoning_effort, so an unsupported parameter cannot break every turn.
        """
        kwargs = dict(
            model=CHAT_MODEL,
            messages=api_messages,
            temperature=0.6,
            max_completion_tokens=CHAT_MAX_COMPLETION_TOKENS,
            top_p=1,
            stream=False,
        )

        started = time.perf_counter()
        try:
            if self._supports_reasoning_effort:
                completion = self.groq_client.chat.completions.create(
                    reasoning_effort=CHAT_REASONING_EFFORT, **kwargs
                )
            else:
                completion = self.groq_client.chat.completions.create(**kwargs)
        except Exception as e:
            if self._supports_reasoning_effort and "reasoning" in str(e).lower():
                logger.warning(
                    "Model rejected reasoning_effort, retrying without it: %s", e
                )
                type(self)._supports_reasoning_effort = False
                completion = self.groq_client.chat.completions.create(**kwargs)
            else:
                raise

        self._log_completion_timing("chat", completion, time.perf_counter() - started)
        return completion

    @staticmethod
    def _log_completion_timing(label: str, completion, wall_seconds: float) -> None:
        """
        Log Groq's own stage timings next to wall clock.

        queue/prompt/completion time say whether the model or the network is the
        bottleneck, which is the number you want before tuning anything else.
        """
        usage = getattr(completion, "usage", None)
        logger.info(
            "[timing] %s wall=%.2fs queue=%.2fs prompt=%.2fs completion=%.2fs "
            "prompt_tokens=%s completion_tokens=%s",
            label,
            wall_seconds,
            getattr(usage, "queue_time", 0.0) or 0.0,
            getattr(usage, "prompt_time", 0.0) or 0.0,
            getattr(usage, "completion_time", 0.0) or 0.0,
            getattr(usage, "prompt_tokens", "?"),
            getattr(usage, "completion_tokens", "?"),
        )
    
    def _sanitize_for_speech(self, text: str) -> str:
        """
        Sanitize text for better TTS pronunciation.
        Applies pronunciation dictionary for acronyms, technical terms, and names.
        """
        # Dictionary of technical terms and names
        replace_map = {
            # Acronyms (Force letter-by-letter)
            r"\bAWS\b": "A. W. S.",
            r"\bSQL\b": "Sequel",
            r"\bAPI\b": "A. P. I.",
            r"\bCEO\b": "C. E. O.",
            r"\bCTO\b": "C. T. O.",
            r"\bUI\b": "U. I.",
            r"\bUX\b": "U. X.",
            r"\bURL\b": "U. R. L.",
            r"\bSaaS\b": "Sass",
            r"\bCI/CD\b": "C. I. C. D.",
            r"\bJWT\b": "J. W. T.",
            
            # Tech Jargon
            r"\bKubernetes\b": "Koo-ber-net-ees",
            r"\bgRPC\b": "G. R. P. C.",
            r"\bJSON\b": "Jay-sawn",
            
            # Homographs
            r"\bresume\b": "reh-zoo-may",
            r"\bResume\b": "Reh-zoo-may",
            r"\blive\b": "lye-v",  # As in "live server"
        }
        
        # User Name Injection (Dynamic)
        if self.candidate_name:
            if "Zayeem" in self.candidate_name:
                replace_map[fr"\b{re.escape(self.candidate_name)}\b"] = "Zaa-eem"
            # Add more name mappings as needed
        
        for pattern, replacement in replace_map.items():
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        
        return text
    
    def _clean_response_text(self, text: str) -> str:
        """
        Clean AI-generated response text by removing Markdown artifacts and filler text.
        """
        import re
        # Remove bold/italic markers (* or **)
        text = re.sub(r'\*+', '', text)
        # Remove headers (###)
        text = re.sub(r'#+\s', '', text)
        # Remove strict "Awaiting response" meta-text if it appears
        text = re.sub(r'\[.*?\]', '', text) 
        return text.strip()
    
    def text_to_speech(self, text: str) -> Optional[str]:
        """
        Synthesize speech and return it base64-encoded.

        Streams the audio straight into memory as MP3. The previous version
        wrote an uncompressed WAV to disk, read it back, then deleted it - three
        round trips through the filesystem plus a payload roughly ten times
        larger than it needed to be.
        """
        try:
            sanitized_text = self._sanitize_for_speech(text)

            options = SpeakOptions(
                model=TTS_MODEL,
                encoding=TTS_ENCODING,
                bit_rate=TTS_BIT_RATE,
            )

            started = time.perf_counter()
            response = self.deepgram_client.speak.v("1").stream(
                {"text": sanitized_text}, options
            )
            audio_data = response.stream.getvalue()

            logger.info(
                "[timing] tts wall=%.2fs chars=%d bytes=%d",
                time.perf_counter() - started,
                len(sanitized_text),
                len(audio_data),
            )

            return base64.b64encode(audio_data).decode("utf-8")

        except Exception as e:
            logger.error("TTS Error: %s", e)
            return None

    def stream_speech(self, text: str) -> Iterator[bytes]:
        """
        Yield synthesized speech as it is produced, rather than after it is finished.

        Deepgram already streams /v1/speak back progressively: measurements showed
        the first audio arriving in ~1s while the rest of a long answer took several
        more seconds. Buffering the whole body before replying meant the audio for
        the first sentence sat on the server while the user waited in silence.
        Forwarding chunks straight through makes time-to-first-audio roughly
        constant regardless of how long the answer is.

        The connection is opened here rather than inside the generator so that an
        upstream rejection surfaces as an error the caller can turn into a real
        status code. Once the response has started streaming it is too late - the
        client would see a 200 with a truncated body.

        The Deepgram SDK's stream() reads the full response before returning, so
        this talks to the endpoint directly to keep the stream open.
        """
        sanitized_text = self._sanitize_for_speech(text)

        params = {
            "model": TTS_MODEL,
            "encoding": TTS_ENCODING,
            "bit_rate": TTS_BIT_RATE,
        }
        headers = {
            "Authorization": f"Token {self.deepgram_api_key}",
            "Content-Type": "application/json",
        }

        started = time.perf_counter()
        client = httpx.Client(timeout=httpx.Timeout(30.0, connect=10.0))

        try:
            response = client.send(
                client.build_request(
                    "POST",
                    TTS_URL,
                    params=params,
                    headers=headers,
                    json={"text": sanitized_text},
                ),
                stream=True,
            )
        except Exception:
            client.close()
            raise

        try:
            response.raise_for_status()
        except Exception:
            response.close()
            client.close()
            raise

        chunks = self._iter_speech_chunks(
            response, client, started, len(sanitized_text)
        )

        # The generator closes the connection in its own finally block, but that
        # only runs if it was started. If the caller abandons it before the first
        # chunk - a client that hangs up before the response begins - the socket
        # to Deepgram would be left open. Tying cleanup to the generator object
        # itself covers that; both closes are idempotent.
        weakref.finalize(chunks, self._close_speech_stream, response, client)

        return chunks

    @staticmethod
    def _close_speech_stream(response: httpx.Response, client: httpx.Client) -> None:
        """Release an upstream speech connection. Safe to call more than once."""
        try:
            response.close()
        except Exception:
            pass
        try:
            client.close()
        except Exception:
            pass

    @staticmethod
    def _iter_speech_chunks(
        response: httpx.Response,
        client: httpx.Client,
        started: float,
        char_count: int,
    ) -> Iterator[bytes]:
        """Forward audio chunks, then report how the stream actually performed."""
        first_chunk_at = None
        total_bytes = 0

        try:
            for chunk in response.iter_bytes(TTS_CHUNK_BYTES):
                if not chunk:
                    continue
                if first_chunk_at is None:
                    first_chunk_at = time.perf_counter() - started
                total_bytes += len(chunk)
                yield chunk

            logger.info(
                "[timing] tts stream first_byte=%.2fs total=%.2fs chars=%d bytes=%d",
                first_chunk_at if first_chunk_at is not None else -1.0,
                time.perf_counter() - started,
                char_count,
                total_bytes,
            )

        except GeneratorExit:
            # Client hung up (interrupt, new turn, page closed). Stop pulling from
            # Deepgram instead of synthesizing audio nobody will hear.
            logger.info("[timing] tts stream cancelled after %d bytes", total_bytes)
            raise

        except Exception as e:
            # Headers are already sent, so the body just ends short here; the
            # client treats a truncated clip as a turn without full audio.
            logger.error("TTS stream error after %d bytes: %s", total_bytes, e)

        finally:
            InterviewService._close_speech_stream(response, client)

    def process_interview_turn(
        self,
        resume_text: str,
        job_description: str,
        candidate_name: str,
        messages: List[Dict[str, str]],
        difficulty: str = "medium"
    ) -> Tuple[str, Optional[str]]:
        
        started = time.perf_counter()

        response_text = self.generate_interview_response(
            resume_text, job_description, candidate_name, messages, difficulty
        )

        logger.info("[timing] turn total wall=%.2fs", time.perf_counter() - started)

        # Audio is no longer synthesized here. Speech was ~81% of a warm turn and
        # the client could not hear a syllable until the whole clip was built, so
        # /chat now returns text immediately and the browser streams the audio
        # from /speak while it renders.
        return response_text, None
    
    def build_feedback_system_prompt(self) -> str:
        return """
            You are a **Senior Technical Interviewer Manager** conducting a thorough post-interview evaluation.

            Your role is to provide **critical, specific, and actionable feedback** based ONLY on the interview transcript provided.

            === EVALUATION CRITERIA ===

            Analyze the candidate's performance across:
            1. **Technical Accuracy**: Did they demonstrate correct understanding of concepts?
            2. **Communication Clarity**: Were answers clear, structured, and well-articulated?
            3. **Depth of Knowledge**: Did they provide specifics, examples, and details?
            4. **Problem-Solving Approach**: Did they think through problems methodically?
            5. **Relevance**: Did answers address the question asked?

            === CRITICAL INSTRUCTIONS ===

            1. **STRICT GROUNDING RULE - NO HALLUCINATIONS**
            - **YOU MUST ONLY ANALYZE TEXT PRESENT IN THE CONVERSATION HISTORY**
            - DO NOT hallucinate topics that were not discussed
            - DO NOT invent technologies, frameworks, or concepts the candidate never mentioned
            - DO NOT use example phrases like "React", "PostgreSQL", "Spring Boot" unless EXPLICITLY stated by the candidate
            - If you cannot find evidence in the transcript, do NOT make assumptions

            2. **MANDATORY CITATION RULE**
            - For EVERY improvement you suggest, you MUST quote the exact sentence the user said that triggered it
            - Format: "When you said '[EXACT QUOTE]', this was problematic because..."
            - If you cannot find an exact quote, you cannot make that improvement suggestion
            - NO GENERIC ADVICE - every piece of feedback must be grounded in the actual conversation

            3. **SHORT INTERVIEW HANDLING**
            - If the interview has fewer than 4 exchanges or lacks technical depth:
                * Give a neutral rating (5-7)
                * Explicitly state: "The interview was brief and didn't cover enough topics for a comprehensive evaluation"
                * Provide general advice: "Complete a longer session to demonstrate your full capabilities"
                * DO NOT invent technical flaws that weren't demonstrated

            4. **BE SPECIFIC - WHEN EVIDENCE EXISTS**
            - If the candidate gave a vague answer, quote it exactly and explain why it was vague
            - If they made a technical error, cite the exact statement and correct it
            - If they struggled with a concept, reference the specific exchange
            - Always tie feedback to actual evidence from the conversation

            5. **RATING SCALE (out of 10)**
            - 1-3: Poor - Major gaps, unclear communication, incorrect answers (MUST have clear evidence)
            - 4-5: Below Average - Some knowledge but lacks depth or clarity
            - 6-7: Average - Solid foundation but room for improvement
            - 8-9: Good - Strong performance with minor areas to improve
            - 10: Exceptional - Outstanding technical depth and communication

            6. **JSON OUTPUT STRUCTURE**
            Strictly follow this schema:
            - "rating": integer (1-10)
            - "feedback": string (2-3 paragraphs of analysis)
            - "improvements": array of strings (each with quoted evidence + suggestion)

            === OUTPUT FORMAT ===

            Return a valid JSON object with this EXACT structure (no markdown, no extra text):

            {
                "rating": <integer between 1-10>,
                "feedback": "<2-3 paragraph detailed analysis. Reference ONLY what actually happened. If brief, acknowledge that.>",
                "improvements": [
                    "Quote: '[EXACT USER QUOTE]' - Suggestion: [How to improve this specific response]",
                    "Quote: '[ANOTHER EXACT QUOTE]' - Suggestion: [Specific improvement]",
                    "[General advice based on interview length/depth if applicable]"
                ]
            }

            **FINAL REMINDERS:**
            - Every improvement MUST have a quoted sentence from the candidate (unless it's general length advice)
            - If the interview was too short, be honest - don't fabricate problems
            - NEVER mention technologies not discussed by the candidate
            - When in doubt: be truthful and general rather than specific and fabricated
            - Your credibility depends on grounding every claim in actual evidence

            **Your goal:** Provide honest, evidence-based feedback that helps the candidate improve based on what ACTUALLY happened.
        """
    
    def generate_feedback(self, messages: List[Dict[str, str]]) -> Dict:

        user_messages = [msg for msg in messages if msg.get("role") == "user"]
        
        if len(user_messages) < 3:
            return {
                "rating": 0,
                "feedback": "Interview was too short to provide a meaningful analysis. The conversation contained fewer than 3 exchanges, which is insufficient to evaluate technical skills, communication, or problem-solving abilities. To receive actionable feedback, please complete a longer interview session.",
                "improvements": [
                    "Complete a longer interview session (at least 5-10 exchanges) to demonstrate your full capabilities",
                    "Ensure you answer questions in detail to give the interviewer enough context to evaluate your skills",
                    "Practice mock interviews to build confidence for longer sessions"
                ]
            }
        
        system_prompt = self.build_feedback_system_prompt()
        api_messages = [{"role": "system", "content": system_prompt}] + messages
        
        try:
            started = time.perf_counter()
            completion = self.groq_client.chat.completions.create(
                model=CHAT_MODEL,
                messages=api_messages,
                temperature=0.2,
                max_completion_tokens=2000,
                top_p=1,
                stream=False,
                response_format={"type": "json_object"}
            )
            self._log_completion_timing(
                "feedback", completion, time.perf_counter() - started
            )

            feedback_json = completion.choices[0].message.content
            return json.loads(feedback_json)
            
        except Exception as e:
            raise Exception(f"Feedback generation failed: {str(e)}")

