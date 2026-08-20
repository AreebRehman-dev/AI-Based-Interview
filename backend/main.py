from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from services.interview_service import (
    InterviewService,
    MAX_SPEECH_CHARS,
    TTS_MIME_TYPE,
)
from services.audio_service import AudioService
from services.pdf_service import PDFService
import logging
import os
from pathlib import Path


env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# Surfaces the [timing] lines the services emit for each stage of a turn.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI()

origins = [os.getenv("FRONTEND_URL", "http://localhost:3000")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

interview_service = InterviewService()
audio_service = AudioService()
pdf_service = PDFService()

class InterviewContext(BaseModel):
    resume_text: str
    job_description: str
    candidate_name: str
    messages: List[dict]
    difficulty: str = "medium"

@app.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    """
    Health check endpoint to verify the service is running.
    Returns status and service information.

    HEAD is allowed alongside GET so uptime monitors (which default to
    HEAD) don't get a 405.
    """
    return {
        "status": "healthy",
        "service": "AI Interview Bot",
        "version": "1.0.0"
    }

# NOTE: the endpoints below are deliberately `def`, not `async def`.
# The Groq and Deepgram SDK calls they make are synchronous and blocking, so
# under `async def` they would hold the event loop for the whole turn and force
# concurrent interviews to run one after another. Plain `def` makes FastAPI run
# them in a threadpool instead, so sessions no longer queue behind each other.

@app.post("/chat")
def chat_endpoint(context: InterviewContext):
    """
    Main chat endpoint for the AI interviewer.
    Generates interview questions and responses with audio.
    """
    try:
        response_text, audio_data = interview_service.process_interview_turn(
            resume_text=context.resume_text,
            job_description=context.job_description,
            candidate_name=context.candidate_name,
            messages=context.messages,
            difficulty=context.difficulty
        )

        return {
            "response": response_text,
            "audio": audio_data,
            "audio_mime": TTS_MIME_TYPE
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/speak")
def speak_endpoint(text: str = Query(..., min_length=1, max_length=MAX_SPEECH_CHARS)):
    """
    Stream synthesized speech for a line of interview dialogue.

    A GET returning chunked audio/mpeg lets the browser play an <audio> element
    progressively - playback starts on the first chunk instead of waiting for the
    whole clip, which is what made speech dominate every turn.
    """
    try:
        # Opening the upstream stream here means a rejection becomes a real error
        # status instead of an empty 200 that the browser reads as silence.
        audio_chunks = interview_service.stream_speech(text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Speech synthesis failed: {e}")

    return StreamingResponse(
        audio_chunks,
        media_type=TTS_MIME_TYPE,
        headers={
            # Nothing downstream should buffer this or the streaming is undone.
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    )

@app.post("/transcribe")
def transcribe_audio(file: UploadFile = File(...)):
    """
    Transcribe audio to text using Deepgram STT.
    """
    try:
        audio_data = file.file.read()
        transcript = audio_service.transcribe_audio(audio_data)
        return {"transcript": transcript}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process-pdf")
def process_pdf(file: UploadFile = File(...)):
    """
    Process a PDF file and extract text.
    """
    try:
        content = file.file.read()
        text = pdf_service.process_pdf(content)
        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/feedback")
def feedback_endpoint(context: InterviewContext):
    """
    Generate feedback based on the interview conversation.
    """
    try:
        feedback = interview_service.generate_feedback(context.messages)
        return feedback
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

