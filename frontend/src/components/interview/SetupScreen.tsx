"use client";
import { ChangeEvent, DragEvent, useState } from "react";
import {
  FileText,
  Briefcase,
  Play,
  Clock,
  Target,
  User,
  UploadCloud,
  CheckCircle2,
  Sparkles,
  Mic,
  BarChart3,
  ShieldCheck,
} from "lucide-react";

interface SetupScreenProps {
  name: string;
  setName: (name: string) => void;
  jobDescription: string;
  setJobDescription: (jd: string) => void;
  resume: string;
  setResume: (resume: string) => void;
  duration: number;
  setDuration: (duration: number) => void;
  difficulty: string;
  setDifficulty: (difficulty: string) => void;
  startInterview: () => void;
  handleFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  loading: boolean;
}

const DURATIONS = [5, 15, 30, 45];

const DIFFICULTIES = [
  {
    value: "easy",
    label: "Beginner",
    tag: "Beginner Mode",
    description: "Supportive pacing with guiding hints.",
  },
  {
    value: "medium",
    label: "Pro",
    tag: "Pro Mode",
    description: "Realistic depth, like a real screen.",
  },
  {
    value: "hard",
    label: "Roast",
    tag: "Roast Mode",
    description: "Relentless follow-ups, no mercy.",
  },
];

const HIGHLIGHTS = [
  {
    icon: Mic,
    title: "Real voice conversation",
    description: "Speak your answers and hear the interviewer respond.",
  },
  {
    icon: BarChart3,
    title: "Scored performance report",
    description: "A rating with concrete, actionable next steps.",
  },
  {
    icon: ShieldCheck,
    title: "Tailored to your role",
    description: "Questions grounded in your resume and the job post.",
  },
];

export default function SetupScreen({
  name,
  setName,
  jobDescription,
  setJobDescription,
  resume,
  duration,
  setDuration,
  difficulty,
  setDifficulty,
  startInterview,
  handleFileChange,
  loading,
}: SetupScreenProps) {
  const [isDragging, setIsDragging] = useState(false);

  const hasResume = resume.trim().length > 0;
  const isReady = name.trim() && jobDescription.trim() && hasResume;

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    handleFileChange({
      target: { files },
    } as unknown as ChangeEvent<HTMLInputElement>);
  };

  return (
    <div className="w-full max-w-5xl">
      {/* Hero */}
      <div className="mx-auto max-w-2xl text-center animate-fade-up">
        <span className="inline-flex items-center gap-2 rounded-full border border-brand-200/70 bg-white/70 px-3.5 py-1.5 text-xs font-medium text-brand-700 shadow-xs backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" />
          AI-powered mock interviews
        </span>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl md:text-[2.75rem] md:leading-[1.1]">
          Practice interviews that{" "}
          <span className="text-gradient-brand">feel real</span>
        </h1>
        <p className="mx-auto mt-3.5 max-w-xl text-[0.95rem] leading-relaxed text-slate-600">
          Set the stage below, then talk through a live technical interview and walk
          away with a scored breakdown of exactly what to sharpen.
        </p>
      </div>

      {/* Form + settings */}
      <div className="mt-9 grid grid-cols-1 gap-5 lg:mt-12 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* Left: candidate details */}
        <section className="surface-card animate-fade-up overflow-hidden rounded-2xl">
          <header className="border-b border-slate-900/5 bg-slate-50/60 px-5 py-4 sm:px-7 sm:py-5">
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
              Candidate &amp; role
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              The interviewer uses this to ground every question.
            </p>
          </header>

          <div className="stagger space-y-6 px-5 py-6 sm:px-7 sm:py-7">
            {/* Name */}
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="flex items-center gap-2 text-sm font-medium text-slate-800"
              >
                <User className="h-4 w-4 text-slate-400" />
                Your name
              </label>
              <input
                id="name"
                type="text"
                className="field focus-ring h-11 px-3.5 text-sm"
                placeholder="e.g. Areeb Rehman"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Job description */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="job-description"
                  className="flex items-center gap-2 text-sm font-medium text-slate-800"
                >
                  <Briefcase className="h-4 w-4 text-slate-400" />
                  Job description
                </label>
                {jobDescription.trim().length > 0 && (
                  <span className="text-xs tabular-nums text-slate-400">
                    {jobDescription.trim().length.toLocaleString()} characters
                  </span>
                )}
              </div>
              <textarea
                id="job-description"
                className="field focus-ring min-h-[150px] resize-y px-3.5 py-3 text-sm leading-relaxed"
                placeholder="Paste the job description here — responsibilities, required skills, seniority..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
              />
            </div>

            {/* Resume upload */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <FileText className="h-4 w-4 text-slate-400" />
                Resume
              </label>

              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`group flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-all duration-200 ${
                  isDragging
                    ? "border-brand-500 bg-brand-50/70 ring-4 ring-brand-500/10"
                    : hasResume
                      ? "border-emerald-300 bg-emerald-50/50 hover:border-emerald-400"
                      : "border-slate-300 bg-slate-50/70 hover:border-brand-400 hover:bg-brand-50/40"
                }`}
              >
                {hasResume ? (
                  <>
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <CheckCircle2 className="h-5.5 w-5.5" />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-emerald-800">
                      Resume ready
                    </p>
                    <p className="mt-1 text-xs text-emerald-700/80">
                      {resume.trim().length.toLocaleString()} characters parsed &middot;
                      click to replace
                    </p>
                  </>
                ) : (
                  <>
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-400 shadow-xs ring-1 ring-slate-900/5 transition-colors group-hover:text-brand-600">
                      <UploadCloud className="h-5.5 w-5.5" />
                    </span>
                    <p className="mt-3 text-sm text-slate-600">
                      <span className="font-semibold text-slate-900">
                        Click to upload
                      </span>{" "}
                      or drag and drop
                    </p>
                    <p className="mt-1 text-xs text-slate-500">PDF files only</p>
                  </>
                )}
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </section>

        {/* Right: session settings */}
        <section className="surface-card animate-fade-up overflow-hidden rounded-2xl lg:sticky lg:top-24">
          <header className="border-b border-slate-900/5 bg-slate-50/60 px-5 py-4 sm:px-7 sm:py-5">
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
              Session settings
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Choose how long and how tough.
            </p>
          </header>

          <div className="space-y-7 px-5 py-6 sm:px-7 sm:py-7">
            {/* Duration */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <Clock className="h-4 w-4 text-slate-400" />
                Duration
              </label>
              <div
                role="radiogroup"
                aria-label="Interview duration"
                className="grid grid-cols-4 gap-1.5 rounded-xl border border-slate-200 bg-slate-100/70 p-1.5"
              >
                {DURATIONS.map((value) => {
                  const active = duration === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setDuration(value)}
                      className={`focus-ring rounded-lg py-2 text-sm font-medium transition-all duration-200 ${
                        active
                          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {value}
                      <span className="ml-0.5 text-xs font-normal opacity-70">m</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Difficulty */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <Target className="h-4 w-4 text-slate-400" />
                Difficulty
              </label>
              <div
                role="radiogroup"
                aria-label="Interview difficulty"
                className="space-y-2"
              >
                {DIFFICULTIES.map((option) => {
                  const active = difficulty === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setDifficulty(option.value)}
                      className={`focus-ring flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-200 ${
                        active
                          ? "border-brand-500/60 bg-brand-50/70 shadow-[0_0_0_4px_oklch(0.58_0.19_274/0.08)]"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                          active
                            ? "border-brand-600 bg-brand-600"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {active && (
                          <span className="h-1.5 w-1.5 rounded-full bg-white" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span
                          className={`block text-sm font-semibold ${
                            active ? "text-brand-700" : "text-slate-900"
                          }`}
                        >
                          {option.tag}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                          {option.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Start */}
            <div className="space-y-3 border-t border-slate-900/5 pt-6">
              <button
                onClick={startInterview}
                disabled={loading}
                className="btn-brand focus-ring inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    Start interview
                  </>
                )}
              </button>
              <p className="text-center text-xs leading-relaxed text-slate-500">
                {isReady
                  ? "Microphone access is requested when you start."
                  : "Add your name, the job description, and a resume to begin."}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Highlights */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3 lg:mt-8">
        {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
          <div
            key={title}
            className="animate-fade-up rounded-xl border border-slate-900/5 bg-white/60 p-4 backdrop-blur-sm transition-colors hover:bg-white/90"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              <Icon className="h-4.5 w-4.5" />
            </span>
            <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
