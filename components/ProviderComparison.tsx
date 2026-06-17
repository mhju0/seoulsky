"use client";

import { rainRiskNext12h } from "@/lib/compare";
import { timeAgoKo } from "@/lib/format";
import type {
  ComparisonMetric,
  ProviderAvailability,
  ProviderComparison as ProviderComparisonData,
  ProviderSnapshot,
} from "@/lib/types";
import { MetricLabel } from "./atmosphere/EtchedType";

/**
 * Cross-provider comparison as a quiet etched readout (no cards): each source
 * LEADS with its 강수 확률 (the figure this page exists to compare) shown large,
 * with 기온 · 바람 · 습도 demoted to small secondary rows beneath. Each value
 * carries the signed deviation from the cross-provider average. A source with no
 * precip data (e.g. MET Norway) reads "데이터 없음" — never 0% — and is excluded
 * from the precip average upstream ({@link buildComparison}).
 */

interface Props {
  snapshots: ProviderSnapshot[];
  comparison: ProviderComparisonData | null;
}

const STATUS: Record<ProviderAvailability, { label: string; dot: string }> = {
  ok: { label: "정상", dot: "bg-emerald-300" },
  "needs-config": { label: "설정 필요", dot: "bg-amber-300" },
  error: { label: "오류", dot: "bg-rose-300" },
  unavailable: { label: "미지원", dot: "bg-slate-500" },
};

/** A small signed deviation chip (from the cross-provider average). */
function Delta({ delta, strongAt }: { delta: number | null; strongAt: number }) {
  if (delta === null || Math.abs(delta) < 0.05) return null;
  const rounded = Math.round(delta * 10) / 10;
  return (
    <span className={`ml-2 text-xs ${Math.abs(delta) >= strongAt ? "text-amber-300" : "text-white/45"}`}>
      {delta > 0 ? "+" : ""}
      {rounded}
    </span>
  );
}

/** A demoted secondary reading: 기온 / 바람 / 습도, beneath the precip lead. */
function SecondaryRow({
  label,
  value,
  unit,
  delta,
}: {
  label: string;
  value: number | null;
  unit: string;
  delta: number | null;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/10 py-1.5 last:border-0">
      <MetricLabel className="!tracking-[0.16em] text-white/40">{label}</MetricLabel>
      <span className="font-sans text-sm font-light tabular-nums text-white/70">
        {value !== null ? `${Math.round(value * 10) / 10}${unit}` : "—"}
        <Delta delta={delta} strongAt={1} />
      </span>
    </div>
  );
}

export default function ProviderComparison({ snapshots, comparison }: Props) {
  const averages = new Map<ComparisonMetric, number>(
    comparison?.metrics.map((m) => [m.metric, m.average]) ?? [],
  );

  // Deviation from the cross-provider average — only meaningful with 2+ live sources.
  const deltaOf = (metric: ComparisonMetric, value: number | null): number | null => {
    const avg = averages.get(metric);
    return avg !== undefined && value !== null ? value - avg : null;
  };

  return (
    <div className="flex flex-col gap-9">
      <div className="grid grid-cols-1 gap-x-14 gap-y-9 sm:grid-cols-2">
        {snapshots.map((s) => {
          const st = STATUS[s.status.availability];
          const rain = rainRiskNext12h(s);
          return (
            <div key={s.id} className="flex flex-col">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="truncate font-mono text-sm tracking-[0.12em] text-white/95">
                  {s.status.name}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/55">
                    {st.label}
                  </span>
                </span>
              </div>

              {s.current ? (
                <div className="flex flex-col gap-4">
                  {/* Primary — precipitation. "데이터 없음" when the source carries
                      no precip series (never shown as 0%). */}
                  <div>
                    <MetricLabel className="!tracking-[0.18em] text-white/55">강수 확률</MetricLabel>
                    <div className="mt-1 flex items-baseline">
                      {rain !== null ? (
                        <span className="font-sans text-3xl font-light tabular-nums text-white/95">
                          {Math.round(rain)}
                          <span className="ml-0.5 text-lg text-white/70">%</span>
                          <Delta delta={deltaOf("rainProbability", rain)} strongAt={10} />
                        </span>
                      ) : (
                        <span className="font-mono text-sm uppercase tracking-[0.18em] text-white/45">
                          데이터 없음
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Secondary — 기온 · 바람 · 습도, quiet and subordinate. */}
                  <div className="flex flex-col">
                    <SecondaryRow
                      label="기온"
                      value={s.current.temperature}
                      unit="°"
                      delta={deltaOf("temperature", s.current.temperature)}
                    />
                    <SecondaryRow
                      label="바람"
                      value={s.current.windSpeed}
                      unit=" km/h"
                      delta={deltaOf("windSpeed", s.current.windSpeed)}
                    />
                    <SecondaryRow
                      label="습도"
                      value={s.current.humidity}
                      unit="%"
                      delta={deltaOf("humidity", s.current.humidity)}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-white/55">{s.status.message}</p>
              )}

              {s.status.missingEnvVars.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                  {s.status.missingEnvVars.map((v) => (
                    <code key={v} className="font-mono text-[10px] text-white/50">
                      {v}
                    </code>
                  ))}
                </div>
              )}

              {s.current && (
                <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
                  업데이트 {timeAgoKo(s.status.lastUpdated)}
                  {s.status.fromCache && " · 캐시"}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {comparison && comparison.notes.length > 0 && (
        <div className="flex flex-col gap-1">
          {comparison.notes.map((note) => (
            <p key={note} className="text-xs leading-relaxed text-white/50">
              · {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
