"use client";
import { useState, useEffect, ChangeEvent, useRef } from "react";
import axios from "axios";
import SetupScreen from "@/src/components/interview/SetupScreen";
import InterviewSession from "@/src/components/interview/InterviewSession";
import ReportCard from "@/src/components/interview/ReportCard";
import { useInterviewAudio } from "@/src/hooks/useInterviewAudio";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogOverlay,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Feedback {
  rating: number;
  feedback: string;
  improvements: string[];
}

type Step = "setup" | "interview" | "feedback";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function Home() {

  const [step, setStep] = useState<Step>("setup");
  
  const [name, setName] = useState("");
  const [resume, setResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [duration, setDuration] = useState(15);
  const [difficulty, setDifficulty] = useState("medium");
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimerActive, setIsTimerActive] = useState(false);
  
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  
  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    isError?: boolean;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: "",
    description: "",
    isError: false,
  });
  
  const {
    isRecording,
    isAudioPlaying,
    playAudio,
    stopAudio,
    startRecording,
    stopRecording,
  } = useInterviewAudio();

  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const transcribeAbortControllerRef = useRef<AbortController | null>(null);
  const feedbackAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isTimerActive || timeLeft <= 0) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsTimerActive(false);
          handleEndInterview();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerActive, timeLeft]);
  
  const handleStartInterview = async () => {
    if (!name || !resume || !jobDescription) {
      setAlertDialog({
        isOpen: true,
        title: "Missing Information",
        description: "Please fill in all required fields (name, resume, and job description).",
        isError: true,
      });
      return;
    }

    setTimeLeft(duration * 60);
    setIsTimerActive(true);
    setStep("interview");

    await handleSendMessage(`Hello, I am ${name}.`, true);
  };

  const handleSendMessage = async (text: string, isSystemInit = false) => {
    if (!text.trim()) return;

    const newHistory = isSystemInit 
      ? [] 
      : [...messages, { role: "user" as const, content: text }];

    if (!isSystemInit) {
      setMessages(newHistory);
      setCurrentInput("");
    }

    setLoading(true);

    try {
      chatAbortControllerRef.current = new AbortController();

      const response = await axios.post(`${API_BASE_URL}/chat`, {
        resume_text: resume,
        job_description: jobDescription,
        messages: newHistory,
        candidate_name: name,
        difficulty: difficulty,
      }, {
        signal: chatAbortControllerRef.current.signal,
      });

      const botReply = response.data.response;
      const audioBase64 = response.data.audio;

      setMessages([...newHistory, { role: "assistant", content: botReply }]);

      if (audioBase64) {
        playAudio(audioBase64);
      }
    } 
    catch (error) {
      if (axios.isCancel(error)) {
        console.log("Chat request was cancelled");
        return;
      }
      console.error("Error communicating with AI:", error);
      setAlertDialog({
        isOpen: true,
        title: "AI Response Failed",
        description: "Failed to get AI response. Please try again.",
        isError: true,
      });
    } 
    finally {
      setLoading(false);
      chatAbortControllerRef.current = null;
    }
  };

  const handleAudioUpload = async (audioBlob: Blob) => {
    /**
     * Upload audio blob to backend for transcription
     * Then automatically send the transcribed text as a message
     */
    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.wav");

      setLoading(true);
      
      transcribeAbortControllerRef.current = new AbortController();
      
      const response = await axios.post(`${API_BASE_URL}/transcribe`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        signal: transcribeAbortControllerRef.current.signal,
      });

      const transcript = response.data.transcript;
      
      if (transcript) {
        await handleSendMessage(transcript);
      }
    } 
    catch (error) {
      if (axios.isCancel(error)) {
        console.log("Transcription request was cancelled");
        return;
      }
      console.error("Transcription failed:", error);
      setAlertDialog({
        isOpen: true,
        title: "Transcription Failed",
        description: "Failed to transcribe audio. Please try again.",
        isError: true,
      });
    } 
    finally {
      setLoading(false);
      transcribeAbortControllerRef.current = null;
    }
  };

  const handleToggleRecording = async () => {
    if (isRecording) {
      // Stop recording and immediately upload
      try {
        const audioBlob = await stopRecording();
        
        if (!audioBlob) {
          console.warn("No audio blob returned from stopRecording");
          return;
        }
        
        // Immediately upload for transcription
        await handleAudioUpload(audioBlob);
      } 
      catch (error) {
        console.error("Recording/upload failed:", error);
        alert("Failed to process audio. Please try again.");
      }
    } 
    else {
      // Start recording
      try {
        await startRecording();
      } 
      catch (error) {
        console.error("Recording failed:", error);
        setAlertDialog({
          isOpen: true,
          title: "Recording Failed",
          description: error instanceof Error ? error.message : "Failed to start recording",
          isError: true,
        });
      }
    }
  };

  const handleInterrupt = () => {
    stopAudio();
    setLoading(false);
  };

  const handleEndInterview = async () => {
    if (messages.length === 0) {
      setAlertDialog({
        isOpen: true,
        title: "No Interview Data",
        description: "There is no interview data to analyze. Please conduct an interview first.",
        isError: true,
      });
      return;
    }

    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
      chatAbortControllerRef.current = null;
    }
    if (transcribeAbortControllerRef.current) {
      transcribeAbortControllerRef.current.abort();
      transcribeAbortControllerRef.current = null;
    }

    stopAudio();
    
    if (isRecording) {
      await stopRecording();
    }
    
    setIsTimerActive(false);
    setLoading(true);

    try {
      feedbackAbortControllerRef.current = new AbortController();

      const response = await axios.post(`${API_BASE_URL}/feedback`, {
        resume_text: resume,
        job_description: jobDescription,
        candidate_name: name,
        messages: messages,
      }, {
        signal: feedbackAbortControllerRef.current.signal,
      });

      setFeedback(response.data);
      setStep("feedback");
    } 
    catch (error) {
      if (axios.isCancel(error)) {
        console.log("Feedback request was cancelled");
        return;
      }
      console.error("Error generating feedback:", error);
      setAlertDialog({
        isOpen: true,
        title: "Feedback Generation Failed",
        description: "Failed to generate feedback. Please try again.",
        isError: true,
      });
    } 
    finally {
      setLoading(false);
      feedbackAbortControllerRef.current = null;
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/process-pdf`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setResume(response.data.text);

      setAlertDialog({
        isOpen: true,
        title: "Success",
        description: "Resume parsed successfully!",
        isError: false,
      });
    } 
    catch (error) {
      console.error("PDF parsing failed:", error);
      setAlertDialog({
        isOpen: true,
        title: "PDF Parsing Failed",
        description: "Failed to parse PDF. Please try again.",
        isError: true,
      });
    } 
    finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    if (chatAbortControllerRef.current) {
      chatAbortControllerRef.current.abort();
      chatAbortControllerRef.current = null;
    }
    if (transcribeAbortControllerRef.current) {
      transcribeAbortControllerRef.current.abort();
      transcribeAbortControllerRef.current = null;
    }
    if (feedbackAbortControllerRef.current) {
      feedbackAbortControllerRef.current.abort();
      feedbackAbortControllerRef.current = null;
    }

    stopAudio();
    
    if (isRecording) {
      await stopRecording();
    }
    
    setStep("setup");
    setMessages([]);
    setFeedback(null);
    setCurrentInput("");
    setTimeLeft(0);
    setIsTimerActive(false);
    setLoading(false);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <main className={`min-h-[100dvh] flex flex-col ${step === "interview" ? "" : "app-canvas"}`}>
      {/* Global Header - Conditionally Rendered */}
      {step !== "interview" && (
        <header className="sticky top-0 z-30 w-full border-b border-slate-900/5 surface-glass">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 sm:py-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_6px_18px_-6px_oklch(0.51_0.19_274/0.7)]">
                <Sparkles className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div className="leading-tight">
                <span className="block text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                  AI Interviewer
                </span>
                <span className="hidden text-xs text-slate-500 sm:block">
                  Practice technical interviews with AI-powered feedback
                </span>
              </div>
            </div>

            <span className="hidden items-center gap-2 rounded-full border border-slate-900/5 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-xs sm:inline-flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Voice &amp; text ready
            </span>
          </div>
        </header>
      )}

      {/* Content: remove padding during interview for full-bleed */}
      <div
        className={
          step === "interview"
            ? "flex-1 flex w-full p-0"
            : "relative z-10 flex-1 flex items-start justify-center px-4 pb-20 pt-8 sm:px-6 sm:pt-12 md:pb-24"
        }
      >
        {step === "setup" && (
          <SetupScreen
            name={name}
            setName={setName}
            jobDescription={jobDescription}
            setJobDescription={setJobDescription}
            resume={resume}
            setResume={setResume}
            duration={duration}
            setDuration={setDuration}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            startInterview={handleStartInterview}
            handleFileChange={handleFileChange}
            loading={loading}
          />
        )}

        {step === "interview" && (
          <InterviewSession
            messages={messages}
            loading={loading}
            isRecording={isRecording}
            isAudioPlaying={isAudioPlaying}
            currentInput={currentInput}
            setCurrentInput={setCurrentInput}
            onSendMessage={handleSendMessage}
            onToggleRecording={handleToggleRecording}
            onInterrupt={handleInterrupt}
            onEndInterview={handleEndInterview}
            onExit={handleRestart}
            timeLeft={timeLeft}
            totalTime={duration * 60}
            formatTime={formatTime}
          />
        )}

        {step === "feedback" && feedback && (
          <ReportCard feedback={feedback} onRestart={handleRestart} />
        )}
      </div>

      {step !== "interview" && (
        <footer className="fixed bottom-0 left-0 z-20 w-full border-t border-slate-900/5 surface-glass py-2.5 text-center text-xs text-slate-500">
          Developed by <span className="font-medium text-slate-700">Areeb</span>
        </footer>
      )}

      {/* Global Alert Dialog */}
      <AlertDialog open={alertDialog.isOpen} onOpenChange={(open) => {
        if (!open) {
          setAlertDialog({ ...alertDialog, isOpen: false });
          alertDialog.onConfirm?.();
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <span
              className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full sm:mx-0 ${
                alertDialog.isError
                  ? "bg-red-50 text-red-600 ring-1 ring-red-100"
                  : "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100"
              }`}
            >
              {alertDialog.isError ? (
                <AlertTriangle className="h-6 w-6" />
              ) : (
                <CheckCircle2 className="h-6 w-6" />
              )}
            </span>
            <AlertDialogTitle className={alertDialog.isError ? "text-red-600" : "text-emerald-600"}>
              {alertDialog.title}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {alertDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              className="btn-brand h-10 w-full px-6 sm:w-auto"
              onClick={() => {
                setAlertDialog({ ...alertDialog, isOpen: false });
                alertDialog.onConfirm?.();
              }}
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
        <AlertDialogOverlay className="backdrop-blur-sm" />
      </AlertDialog>
    </main>
  );
}