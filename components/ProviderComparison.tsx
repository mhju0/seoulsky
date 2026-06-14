"use client";

import { motion } from "framer-motion";
import { rainRiskNext12h } from "@/lib/compare";
import { timeAgoKo } from "@/lib/format";
import type {
  ComparisonMetric,
  ProviderAvailability,
  ProviderComparison as ProviderComparisonData,
  ProviderSnapshot,
} from "@/lib/types";

interface Props {
  snapshots: ProviderSnapshot[];
  comparison: ProviderComparisonData | null;
}

const BADGES: Record<ProviderAvailability, { label: string; className: string }> = {
  ok: { label: "정상", className: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30" },
  "needs-config": {
    label: "설정 필요",
    className: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  },
  error: { label: "오류", className: "bg-rose-400/15 text-rose-300 border-rose-400/30" },
  unavailable: {
    label: "미지원",
    className: "bg-slate-400/15 text-slate-400 border-slate-400/25",
  },
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
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-100">
        {value !== null ? `${Math.round(value * 10) / 10}${unit}` : "—"}
        {showDelta && (
          <span
            className={`ml-1.5 text-xs ${Math.abs(delta) >= 1 ? "text-amber-300" : "text-slate-500"}`}
          >
            {delta > 0 ? "+" : ""}
            {Math.round(delta * 10) / 10}
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
    <div className="flex h-full flex-col gap-3">
      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
        {snapshots.map((s, i) => {
          const badge = BADGES[s.status.availability];
          const rain = rainRiskNext12h(s);
          return (
            <motion.div
              key={s.id}
              className="glass flex flex-col rounded-2xl p-4"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: i * 0.08 }}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="truncate text-sm font-semibold text-slate-100">{s.status.name}</h3>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${badge.className}`}
                >
                  {badge.label}
                </span>
              </div>

              {s.current ? (
                <div className="flex flex-col gap-1.5">
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
                <p className="flex-1 text-sm leading-relaxed text-slate-400">{s.status.message}</p>
              )}

              {s.status.missingEnvVars.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.status.missingEnvVars.map((v) => (
                    <code
                      key={v}
                      className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-400"
                    >
                      {v}
                    </code>
                  ))}
                </div>
              )}

              {s.current && (
                <p className="mt-3 text-[11px] text-slate-500">
                  업데이트 {timeAgoKo(s.status.lastUpdated)}
                  {s.status.fromCache && " · 캐시"}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>

      {comparison && comparison.notes.length > 0 && (
        <div className="glass rounded-2xl px-4 py-3">
          {comparison.notes.map((note) => (
            <p key={note} className="text-xs leading-relaxed text-slate-400">
              · {note}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
