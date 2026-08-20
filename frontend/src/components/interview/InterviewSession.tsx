"use client";
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  X,
  PhoneMissed,
  Clock,
  Send,
  Sparkles,
  Volume2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogOverlay,
} from "@/components/ui/alert-dialog";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface InterviewSessionProps {
  messages: Message[];
  isRecording: boolean;
  isAudioPlaying: boolean;
  timeLeft: number;
  totalTime?: number;
  currentInput: string;
  setCurrentInput: (input: string) => void;
  onSendMessage: (text: string) => void;
  onToggleRecording: () => void;
  onInterrupt: () => void;
  onEndInterview: () => void;
  onExit: () => void;
  loading?: boolean;
  formatTime: (seconds: number) => string;
}

export default function InterviewSession({
  messages,
  isRecording,
  isAudioPlaying,
  timeLeft,
  totalTime,
  currentInput,
  setCurrentInput,
  onSendMessage,
  onToggleRecording,
  onInterrupt,
  onEndInterview,
  loading = false,
  formatTime,
}: InterviewSessionProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest message in view as the conversation grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, loading]);

  const isUrgent = timeLeft < 60;
  const elapsedRatio =
    totalTime && totalTime > 0
      ? Math.min(Math.max(1 - timeLeft / totalTime, 0), 1)
      : 0;

  const status = isRecording
    ? { label: "Listening to you", tone: "recording" as const }
    : isAudioPlaying
      ? { label: "Interviewer speaking", tone: "speaking" as const }
      : loading
        ? { label: "Thinking", tone: "thinking" as const }
        : { label: "Ready when you are", tone: "idle" as const };

  const statusStyles: Record<typeof status.tone, string> = {
    recording: "bg-red-50 text-red-700 ring-red-200/70",
    speaking: "bg-brand-50 text-brand-700 ring-brand-200/70",
    thinking: "bg-amber-50 text-amber-700 ring-amber-200/70",
    idle: "bg-slate-100 text-slate-600 ring-slate-200/70",
  };

  const canSend =
    currentInput.trim().length > 0 && !isRecording && !isAudioPlaying;

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <header className="z-20 border-b border-slate-900/5 bg-white/85 backdrop-blur-xl">
        {/* Time progress rail */}
        {totalTime ? (
          <div className="h-0.5 w-full bg-slate-100">
            <div
              className={`h-full transition-[width] duration-1000 ease-linear ${
                isUrgent ? "bg-red-500" : "bg-gradient-to-r from-brand-500 to-brand-700"
              }`}
              style={{ width: `${elapsedRatio * 100}%` }}
            />
          </div>
        ) : null}

        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Identity + live status */}
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-[0_6px_16px_-6px_oklch(0.51_0.19_274/0.7)]">
              <Sparkles className="h-4 w-4" strokeWidth={2.2} />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-slate-900">
                AI Interviewer
              </p>
              <span
                className={`mt-0.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset transition-colors ${
                  statusStyles[status.tone]
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    status.tone === "recording"
                      ? "animate-pulse bg-red-500"
                      : status.tone === "speaking"
                        ? "animate-pulse bg-brand-500"
                        : status.tone === "thinking"
                          ? "animate-pulse bg-amber-500"
                          : "bg-emerald-500"
                  }`}
                />
                {status.label}
              </span>
            </div>
          </div>

          {/* Timer + end call */}
          <div className="flex shrink-0 items-center gap-2">
            <div
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold tabular-nums ring-1 ring-inset transition-colors ${
                isUrgent
                  ? "bg-red-50 text-red-600 ring-red-200/70"
                  : "bg-slate-100 text-slate-700 ring-slate-200/70"
              }`}
            >
              <Clock className="h-3.5 w-3.5 opacity-70" />
              <span className="font-mono">{formatTime(timeLeft)}</span>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="focus-ring inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-xs transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600">
                  <PhoneMissed className="h-4 w-4" />
                  <span className="hidden sm:inline">End interview</span>
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Finish interview?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you ready to submit your session and receive feedback?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="btn-brand" onClick={onEndInterview}>
                    Finish
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
              <AlertDialogOverlay className="backdrop-blur-sm" />
            </AlertDialog>
          </div>
        </div>
      </header>

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 py-6 sm:px-6 sm:py-8"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm ring-1 ring-slate-900/5">
                <Mic className="h-6 w-6" />
              </span>
              <p className="mt-4 text-sm font-medium text-slate-700">
                Your interview is starting
              </p>
              <p className="mt-1 max-w-xs text-sm text-slate-500">
                Tap the microphone to answer out loud, or type your response below.
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg, index) => {
              const isUser = msg.role === "user";
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className={`flex items-end gap-2.5 ${
                    isUser ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  {/* Avatar */}
                  <span
                    className={`mb-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                      isUser
                        ? "bg-slate-900 text-white"
                        : "bg-gradient-to-br from-brand-500 to-brand-700 text-white"
                    }`}
                  >
                    {isUser ? "You" : <Sparkles className="h-3.5 w-3.5" />}
                  </span>

                  <div
                    className={`flex min-w-0 flex-col ${
                      isUser ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] px-4 py-3 shadow-xs sm:max-w-[36rem] ${
                        isUser
                          ? "rounded-2xl rounded-br-md bg-slate-900 text-white"
                          : "rounded-2xl rounded-bl-md border border-slate-900/5 bg-white text-slate-800"
                      }`}
                    >
                      <p className="text-sm leading-relaxed whitespace-pre-line">
                        {msg.content}
                      </p>
                    </div>
                    <span className="mt-1.5 px-1 text-[11px] font-medium text-slate-400">
                      {isUser ? "You" : "AI Interviewer"}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Thinking indicator */}
          {loading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-end gap-2.5"
            >
              <span className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-md border border-slate-900/5 bg-white px-4 py-3 shadow-xs">
                <div className="flex gap-1">
                  {[0, 0.15, 0.3].map((delay) => (
                    <motion.span
                      key={delay}
                      animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                      transition={{ duration: 1, repeat: Infinity, delay }}
                      className="h-1.5 w-1.5 rounded-full bg-brand-500"
                    />
                  ))}
                </div>
                <span className="text-sm text-slate-500">Thinking...</span>
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer + controls */}
      <div className="z-20 border-t border-slate-900/5 bg-white/85 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          {/* Text input */}
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm transition-shadow focus-within:border-brand-500 focus-within:shadow-[0_0_0_4px_oklch(0.58_0.19_274/0.1)]">
            <input
              type="text"
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={
                isRecording
                  ? "Recording your answer..."
                  : isAudioPlaying
                    ? "Interviewer is speaking..."
                    : "Or type your answer..."
              }
              value={currentInput}
              onChange={(e) => setCurrentInput(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && currentInput.trim() && onSendMessage(currentInput)
              }
              disabled={isRecording || isAudioPlaying}
            />
            <button
              type="button"
              onClick={() => currentInput.trim() && onSendMessage(currentInput)}
              disabled={!canSend}
              aria-label="Send answer"
              className={`focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all ${
                canSend
                  ? "btn-brand"
                  : "cursor-not-allowed bg-slate-100 text-slate-300"
              }`}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>

          {/* Live control bar */}
          <div className="flex items-center justify-center gap-3 py-4">
            {/* Interrupt - only while the AI is speaking */}
            <AnimatePresence>
              {isAudioPlaying && (
                <motion.button
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={onInterrupt}
                  className="focus-ring flex h-12 w-12 items-center justify-center rounded-full bg-white text-red-600 shadow-md ring-1 ring-slate-900/5 transition-colors hover:bg-red-50"
                  title="Stop AI"
                >
                  <X className="h-5 w-5" />
                </motion.button>
              )}
            </AnimatePresence>

            {/* Mic */}
            <motion.button
              onClick={onToggleRecording}
              disabled={loading || isAudioPlaying}
              whileTap={{ scale: 0.95 }}
              className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                isRecording
                  ? "recording-glow bg-red-600 text-white hover:bg-red-700"
                  : "btn-brand"
              }`}
              title={isRecording ? "Stop recording" : "Start recording"}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
            >
              {isRecording ? (
                <MicOff className="relative z-10 h-6 w-6" />
              ) : (
                <Mic className="relative z-10 h-6 w-6" />
              )}
            </motion.button>

            {/* Speaking indicator mirrors the interrupt button for balance */}
            <AnimatePresence>
              {isAudioPlaying && (
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-200/70"
                >
                  <Volume2 className="h-5 w-5" />
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* Hint / waveform */}
          <div className="flex h-5 items-center justify-center">
            {isRecording ? (
              <span className="flex items-center gap-2 text-xs font-medium text-red-600">
                <span className="flex h-3.5 items-end gap-0.5">
                  {[0, 0.12, 0.24, 0.36, 0.48].map((delay) => (
                    <span
                      key={delay}
                      className="w-0.5 origin-bottom rounded-full bg-red-500 animate-bar"
                      style={{ height: "100%", animationDelay: `${delay}s` }}
                    />
                  ))}
                </span>
                Recording — tap the mic again when you are done
              </span>
            ) : (
              <span className="text-xs text-slate-400">
                {isAudioPlaying
                  ? "Tap the red button to interrupt"
                  : "Tap the mic to answer out loud"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
