"use client";

import { formatKstTime } from "@/lib/format";
import { MetricLabel } from "../EtchedType";

/**
 * The sunrise → sunset arc: a thin SVG half-arc with the sun riding along it at its
 * real position for the current Seoul instant, the two horizon times at the ends.
 * Geometry only — sunrise/sunset come from the shared snapshot; `now` from the
 * shared clock. When the sun is below the horizon the arc dims and the marker
 * rests at the nearest end.
 */

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

// Arc endpoints (sunrise left, sunset right) and the parametric path it follows.
const sunX = (t: number) => 150 - 130 * Math.cos(Math.PI * t);
const sunY = (t: number) => 100 - 80 * Math.sin(Math.PI * t);

export default function SunArc({
  sunrise,
  sunset,
  now,
}: {
  sunrise: string | null;
  sunset: string | null;
  now: Date | null;
}) {
  const riseMs = sunrise ? Date.parse(sunrise) : NaN;
  const setMs = sunset ? Date.parse(sunset) : NaN;
  const haveSun = Number.isFinite(riseMs) && Number.isFinite(setMs) && setMs > riseMs;

  const nowMs = (now ?? new Date()).getTime();
  const rawT = haveSun ? (nowMs - riseMs) / (setMs - riseMs) : 0;
  const isDay = haveSun && rawT >= 0 && rawT <= 1;
  const t = clamp01(rawT);

  const cx = sunX(t);
  const cy = sunY(t);

  return (
    <div className="flex flex-col gap-4">
      <MetricLabel>Sun · 일출 · 일몰</MetricLabel>

      <svg viewBox="0 0 300 116" className="w-full" role="img" aria-label="일출에서 일몰까지의 태양 위치">
        <defs>
          <linearGradient id="sunArc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffd9a8" stopOpacity={0.18} />
            <stop offset="50%" stopColor="#ffd9a8" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#ffd9a8" stopOpacity={0.18} />
          </linearGradient>
        </defs>

        {/* the horizon line */}
        <line x1="14" y1="100" x2="286" y2="100" stroke="rgba(255,255,255,0.16)" strokeWidth={1} />

        {/* the full arc (faint), then the travelled portion painted brighter */}
        <path
          d="M20 100 A 130 80 0 0 1 280 100"
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={1}
          strokeDasharray="2 4"
        />
        {isDay && (
          <path
            d="M20 100 A 130 80 0 0 1 280 100"
            fill="none"
            stroke="url(#sunArc)"
            strokeWidth={1.4}
            pathLength={1}
            strokeDasharray={`${t} 1`}
          />
        )}

        {/* the sun */}
        <circle
          cx={cx}
          cy={cy}
          r={isDay ? 5 : 3.5}
          fill={isDay ? "#ffd9a8" : "rgba(255,217,168,0.4)"}
          style={isDay ? { filter: "drop-shadow(0 0 6px rgba(255,200,140,0.8))" } : undefined}
        />
      </svg>

      <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.12em] text-white/55">
        <span className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-[0.24em] text-white/35">일출</span>
          <span className="tabular-nums text-white/75">{sunrise ? formatKstTime(sunrise) : "—"}</span>
        </span>
        <span className="flex flex-col items-end gap-0.5">
          <span className="text-[9px] uppercase tracking-[0.24em] text-white/35">일몰</span>
          <span className="tabular-nums text-white/75">{sunset ? formatKstTime(sunset) : "—"}</span>
        </span>
      </div>
    </div>
  );
}
