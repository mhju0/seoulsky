"use client";

import { motion } from "framer-motion";
import type { ConfidenceScore, ProviderComparison } from "@/lib/types";

interface Props {
  confidence: ConfidenceScore;
  comparison: ProviderComparison | null;
}

const LEVEL_LABELS: Record<ConfidenceScore["level"], string> = {
  high: "신뢰도 높음",
  medium: "신뢰도 보통",
  low: "신뢰도 낮음",
  "single-source": "단일 소스 모드",
};

function scoreColor(score: number | null): string {
  if (score === null) return "text-slate-400";
  if (score >= 80) return "text-emerald-300";
  if (score >= 60) return "text-amber-300";
  return "text-rose-300";
}

function barColor(score: number): string {
  if (score >= 80) return "from-emerald-400 to-cyan-400";
  if (score >= 60) return "from-amber-400 to-orange-400";
  return "from-rose-400 to-red-400";
}

function AgreementBar({ label, score }: { label: string; score: number | null }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className={`font-semibold ${scoreColor(score)}`}>
          {score !== null ? `${score}%` : "—"}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        {score !== null && (
          <motion.div
            className={`h-full rounded-full bg-gradient-to-r ${barColor(score)}`}
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ duration: 1.1, ease: "easeOut", delay: 0.2 }}
          />
        )}
      </div>
    </div>
  );
}

export default function ConfidencePanel({ confidence, comparison }: Props) {
  return (
    <div className="glass flex h-full flex-col gap-7 rounded-3xl p-6 md:flex-row md:items-center">
      {/* radar */}
      <div className="mx-auto flex shrink-0 flex-col items-center gap-3">
        <div className="relative flex h-44 w-44 items-center justify-center">
          <div className="radar-ring" style={{ "--ring-delay": "0s" } as React.CSSProperties} />
          <div className="radar-ring" style={{ "--ring-delay": "1.1s" } as React.CSSProperties} />
          <div className="radar-ring" style={{ "--ring-delay": "2.2s" } as React.CSSProperties} />
          <div className="radar-sweep opacity-50" />
          <div className="glass-deep relative flex h-28 w-28 flex-col items-center justify-center rounded-full">
            <span className={`text-glow-soft text-4xl font-light ${scoreColor(confidence.overall)}`}>
              {confidence.overall !== null ? confidence.overall : "—"}
            </span>
            <span className="text-[10px] tracking-widest text-slate-500">CONFIDENCE</span>
          </div>
        </div>
        <span className="glass rounded-full px-3 py-1 text-xs text-slate-300">
          {LEVEL_LABELS[confidence.level]}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {comparison && (
          <span className="self-start rounded-full border border-violet-400/30 bg-violet-500/10 px-3.5 py-1 text-sm font-medium text-violet-200">
            {comparison.headline}
          </span>
        )}

        <div className="flex flex-col gap-3.5">
          <AgreementBar label="기온 일치도" score={confidence.temperature} />
          <AgreementBar label="강수 일치도" score={confidence.rain} />
          <AgreementBar label="바람 일치도" score={confidence.wind} />
        </div>

        <p className="text-sm leading-relaxed text-slate-400">{confidence.explanation}</p>

        <div className="rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/10 to-indigo-500/5 p-4">
          <p className="mb-1.5 text-xs font-semibold tracking-wider text-violet-300">
            지금 무엇을 믿어야 할까요?
          </p>
          <p className="text-sm leading-relaxed text-slate-200">{confidence.recommendation}</p>
        </div>
      </div>
    </div>
  );
}
