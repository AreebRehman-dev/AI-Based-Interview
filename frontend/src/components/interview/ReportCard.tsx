"use client";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  AlertCircle,
  Home,
  Award,
  RotateCcw,
  TrendingUp,
} from "lucide-react";

interface Feedback {
  rating: number;
  feedback: string;
  improvements: string[];
}

interface ReportCardProps {
  feedback: Feedback;
  onRestart: () => void;
}

export default function ReportCard({ feedback, onRestart }: ReportCardProps) {
  // Determine score color: Red (<5), Yellow (5-7), Green (8+)
  const getScoreColor = (rating: number) => {
    if (rating >= 8) return "text-emerald-600";
    if (rating >= 5) return "text-amber-500";
    return "text-red-500";
  };

  const getCircleStroke = (rating: number) => {
    if (rating >= 8) return "stroke-emerald-500";
    if (rating >= 5) return "stroke-amber-400";
    return "stroke-red-500";
  };

  const getVerdictChip = (rating: number) => {
    if (rating >= 8)
      return "bg-emerald-50 text-emerald-700 ring-emerald-200/70";
    if (rating >= 5) return "bg-amber-50 text-amber-700 ring-amber-200/70";
    return "bg-red-50 text-red-700 ring-red-200/70";
  };

  const verdict =
    feedback.rating >= 8
      ? "Outstanding Performance"
      : feedback.rating >= 5
        ? "Good Performance"
        : "Needs Improvement";

  // Circular progress geometry
  const radius = 84;
  const circumference = 2 * Math.PI * radius;
  const progressOffset =
    circumference - (Math.min(Math.max(feedback.rating, 0), 10) / 10) * circumference;

  // Parse feedback to separate strengths and improvements
  const parseStrengths = () => {
    const lines = feedback.feedback.split('\n').filter(line => line.trim());
    return lines.filter(line =>
      line.toLowerCase().includes('good') ||
      line.toLowerCase().includes('well') ||
      line.toLowerCase().includes('strong') ||
      line.toLowerCase().includes('excellent')
    );
  };

  const strengths = parseStrengths();

  return (
    <div className="w-full max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="surface-card overflow-hidden rounded-2xl"
      >
        {/* Header */}
        <div className="relative overflow-hidden border-b border-slate-900/5 bg-gradient-to-br from-slate-900 via-slate-900 to-brand-700 px-5 py-7 sm:px-10 sm:py-9">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage:
                "radial-gradient(28rem 18rem at 85% 0%, white, transparent 65%)",
            }}
          />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80 ring-1 ring-inset ring-white/15">
                <Award className="h-3.5 w-3.5" />
                Interview complete
              </span>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Performance Report
              </h1>
              <p className="mt-1.5 text-sm text-white/60">
                Interview analysis &amp; recommendations
              </p>
            </div>
            <button
              onClick={() => {
                // Ensure any processes are cleaned up before restarting
                onRestart();
              }}
              className="focus-ring shrink-0 rounded-xl border border-white/15 bg-white/10 p-2.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              title="Back to Home"
              aria-label="Back to home"
            >
              <Home className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-10 px-5 py-8 sm:px-10 sm:py-10">
          {/* Score */}
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-10">
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 120, damping: 16 }}
              className="relative h-44 w-44 shrink-0 sm:h-48 sm:w-48"
            >
              <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
                <circle
                  cx="100"
                  cy="100"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="14"
                  className="text-slate-100"
                />
                <motion.circle
                  cx="100"
                  cy="100"
                  r={radius}
                  fill="none"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: progressOffset }}
                  transition={{ delay: 0.4, duration: 1.3, ease: "easeOut" }}
                  className={getCircleStroke(feedback.rating)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.span
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6, type: "spring", stiffness: 150 }}
                  className={`text-6xl font-semibold tabular-nums ${getScoreColor(feedback.rating)}`}
                >
                  {feedback.rating}
                </motion.span>
                <span className="mt-0.5 text-sm font-medium text-slate-400">
                  out of 10
                </span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="min-w-0 flex-1 text-center sm:text-left"
            >
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${getVerdictChip(feedback.rating)}`}
              >
                <TrendingUp className="h-4 w-4" />
                {verdict}
              </span>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Your overall score reflects the depth, clarity, and relevance of your
                answers across the session.
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left">
                  <p className="text-xs font-medium text-slate-500">Strengths noted</p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-emerald-600">
                    {strengths.length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left">
                  <p className="text-xs font-medium text-slate-500">Growth areas</p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-amber-600">
                    {feedback.improvements.length}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Summary */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <h2 className="text-lg font-semibold text-slate-900">Summary</h2>
            <div className="relative mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 p-5 sm:p-6">
              <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand-500 to-brand-700" />
              <p className="whitespace-pre-line pl-3 text-sm leading-relaxed text-slate-600">
                {feedback.feedback}
              </p>
            </div>
          </motion.section>

          {/* Strengths */}
          {strengths.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
            >
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                Strengths
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200/70">
                  {strengths.length}
                </span>
              </h2>
              <div className="mt-3 space-y-2.5">
                {strengths.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.07 }}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-emerald-300 hover:shadow-sm"
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    <p className="flex-1 text-sm leading-relaxed text-slate-600">
                      {item}
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}

          {/* Improvements */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
          >
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              Areas for Growth
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200/70">
                {feedback.improvements.length}
              </span>
            </h2>
            <div className="mt-3 space-y-2.5">
              {feedback.improvements.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + i * 0.07 }}
                  className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-amber-300 hover:shadow-sm"
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                  <p className="flex-1 text-sm leading-relaxed text-slate-600">
                    {item}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* Action */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="border-t border-slate-900/5 pt-7"
          >
            <button
              onClick={onRestart}
              className="btn-brand focus-ring inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold"
            >
              <RotateCcw className="h-4 w-4" />
              Start new interview
            </button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
