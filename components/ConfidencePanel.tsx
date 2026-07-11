"use client";

import type { ConfidenceScore, ProviderComparison } from "@/lib/types";

/**
 * Source-agreement confidence as an etched readout (no glass, no radar dial): a
 * comparison summary and agreement bars — precipitation leading and emphasized,
 * temperature + wind demoted to quiet secondary signals.
 *
 * The comparison and scores are computed upstream; this is presentation only.
 * The score reflects source
 * AGREEMENT, so a unanimous dry forecast reads HIGH, never low.
 */

interface Props {
  confidence: ConfidenceScore;
  comparison: ProviderComparison | null;
}

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

/**
 * Precipitation agreement — the primary, emphasized bar: a larger label + value,
 * a thicker track, and the consensus rain chance as a caption. When fewer than 2
 * sources report precip the agreement is undefined, so it shows a "강수 데이터 부족"
 * low-coverage state and an empty track rather than a fabricated number.
 */
function RainAgreement({ score, consensus }: { score: number | null; consensus: number | null }) {
  const lowCoverage = score === null;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/90">강수 일치도</span>
        {lowCoverage ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/55">
            강수 데이터 부족
          </span>
        ) : (
          <span className={`font-sans text-xl font-light tabular-nums ${scoreColor(score)}`}>{score}%</span>
        )}
      </div>
      <div className="h-[5px] w-full overflow-hidden rounded-full bg-white/10">
        {!lowCoverage && (
          <div className={`h-full rounded-full ${barColor(score)}`} style={{ width: `${score}%` }} />
        )}
      </div>
      <p className="mt-1.5 font-mono text-[10px] tracking-[0.12em] text-white/50">
        {lowCoverage
          ? "강수를 보고한 소스가 2곳 미만입니다"
          : consensus !== null
            ? `평균 강수 확률 ${consensus}%`
            : ""}
      </p>
    </div>
  );
}

/** A demoted secondary agreement signal — smaller, muted, a hairline track. */
function SecondaryRow({ label, score }: { label: string; score: number | null }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/65">{label}</span>
        <span className="font-sans text-xs font-light tabular-nums text-white/75">
          {score !== null ? `${score}%` : "—"}
        </span>
      </div>
      <div className="h-px w-full bg-white/10">
        {score !== null && <div className="h-px bg-white/35" style={{ width: `${score}%` }} />}
      </div>
    </div>
  );
}

export default function ConfidencePanel({ confidence, comparison }: Props) {
  const rainMetric = comparison?.metrics.find((m) => m.metric === "rainProbability") ?? null;
  const consensusRain = rainMetric ? Math.round(rainMetric.average) : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
      <div className="flex min-w-0 flex-col gap-4">
        {comparison && <p className="font-sans text-xl font-light leading-snug text-white/95">{comparison.headline}</p>}
        <p className="max-w-xl text-sm leading-relaxed text-white/75">{confidence.explanation}</p>
      </div>

      {/* Agreement — precipitation leads and is emphasized; 기온 + 바람 are
          present but clearly subordinate (smaller, muted, hairline tracks). */}
      <div className="flex max-w-xl flex-col gap-5">
        <RainAgreement score={confidence.rain} consensus={consensusRain} />
        <div className="flex flex-col gap-2.5 border-t border-white/10 pt-4">
          <SecondaryRow label="기온 일치도" score={confidence.temperature} />
          <SecondaryRow label="바람 일치도" score={confidence.wind} />
        </div>
      </div>
    </div>
  );
}
