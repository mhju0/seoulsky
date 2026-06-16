"use client";

import type { ConfidenceScore, ProviderComparison } from "@/lib/types";

/**
 * Source-agreement confidence as an etched readout (no glass, no radar dial): a
 * large light overall score, three hairline agreement bars, and the plain-language
 * recommendation behind a single hairline accent. Data/logic unchanged.
 */

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
  if (score === null) return "text-white/55";
  if (score >= 80) return "text-emerald-300";
  if (score >= 60) return "text-amber-300";
  return "text-rose-300";
}

function barColor(score: number): string {
  if (score >= 80) return "bg-emerald-300/80";
  if (score >= 60) return "bg-amber-300/80";
  return "bg-rose-300/80";
}

function AgreementRow({ label, score }: { label: string; score: number | null }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/60">{label}</span>
        <span className={`font-sans text-sm font-light tabular-nums ${scoreColor(score)}`}>
          {score !== null ? `${score}%` : "—"}
        </span>
      </div>
      <div className="h-[2px] w-full bg-white/10">
        {score !== null && <div className={`h-[2px] ${barColor(score)}`} style={{ width: `${score}%` }} />}
      </div>
    </div>
  );
}

export default function ConfidencePanel({ confidence, comparison }: Props) {
  return (
    <div className="flex flex-col gap-9 md:flex-row md:items-start md:gap-16">
      <div className="flex shrink-0 flex-col gap-2">
        <span
          className={`font-sans text-[clamp(4rem,10vw,7rem)] font-light leading-[0.85] tabular-nums ${scoreColor(
            confidence.overall,
          )} [text-shadow:0_2px_24px_rgba(0,0,0,0.45)]`}
        >
          {confidence.overall !== null ? confidence.overall : "—"}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/55">
          Confidence · {LEVEL_LABELS[confidence.level]}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-7">
        {comparison && (
          <p className="font-sans text-lg font-light leading-snug text-white/95">{comparison.headline}</p>
        )}

        <div className="flex max-w-md flex-col gap-4">
          <AgreementRow label="기온 일치도" score={confidence.temperature} />
          <AgreementRow label="강수 일치도" score={confidence.rain} />
          <AgreementRow label="바람 일치도" score={confidence.wind} />
        </div>

        <p className="max-w-xl text-sm leading-relaxed text-white/60">{confidence.explanation}</p>

        <div className="max-w-xl border-l border-white/20 pl-4">
          <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.2em] text-white/65">
            지금 무엇을 믿어야 할까요?
          </p>
          <p className="text-sm leading-relaxed text-white/95">{confidence.recommendation}</p>
        </div>
      </div>
    </div>
  );
}
