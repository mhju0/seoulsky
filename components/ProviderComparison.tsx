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
 * Cross-provider comparison as a quiet etched readout (no cards): each source is
 * a column of hairline-separated rows showing its current reading and the signed
 * deviation from the cross-provider average. All data/logic is unchanged from the
 * original panel — only the chrome is stripped.
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

function MetricRow({
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
  const showDelta = delta !== null && Math.abs(delta) >= 0.05;
  return (
    <div className="flex items-baseline justify-between border-b border-white/10 py-2 last:border-0">
      <MetricLabel className="!tracking-[0.18em] text-white/55">{label}</MetricLabel>
      <span className="font-sans text-base font-light tabular-nums text-white/95">
        {value !== null ? `${Math.round(value * 10) / 10}${unit}` : "—"}
        {showDelta && (
          <span className={`ml-2 text-xs ${Math.abs(delta!) >= 1 ? "text-amber-300" : "text-white/45"}`}>
            {delta! > 0 ? "+" : ""}
            {Math.round(delta! * 10) / 10}
          </span>
        )}
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
                <div className="flex flex-col">
                  <MetricRow
                    label="기온"
                    value={s.current.temperature}
                    unit="°"
                    delta={deltaOf("temperature", s.current.temperature)}
                  />
                  <MetricRow
                    label="강수 확률"
                    value={rain}
                    unit="%"
                    delta={deltaOf("rainProbability", rain)}
                  />
                  <MetricRow
                    label="바람"
                    value={s.current.windSpeed}
                    unit=" km/h"
                    delta={deltaOf("windSpeed", s.current.windSpeed)}
                  />
                  <MetricRow
                    label="습도"
                    value={s.current.humidity}
                    unit="%"
                    delta={deltaOf("humidity", s.current.humidity)}
                  />
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
