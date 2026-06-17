"use client";

import { formatKstTime } from "@/lib/format";
import { inkTriplet, instrumentWarm } from "@/lib/cinematic/skyPalette";
import { MetricLabel } from "../EtchedType";

/**
 * The sunrise → sunset arc: a thin SVG half-arc with the sun riding along it at its
 * real position for the current Seoul instant, the two horizon times at the ends.
 * Geometry only — sunrise/sunset come from the shared snapshot; `now` from the
 * shared clock. When the sun is below the horizon the arc dims and the marker
 * rests at the nearest end.
 */

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

// A true circular semicircle: equal radius R about centre x=150 on the baseline
// (y=BASE), so the endpoints land at x=20/280 and the apex sits at (150, BASE−R).
// sunrise rides the left end, noon the apex, sunset the right end.
const R = 130;
const CX = 150;
const BASE = 150;
const sunX = (t: number) => CX - R * Math.cos(Math.PI * t);
const sunY = (t: number) => BASE - R * Math.sin(Math.PI * t);

export default function SunArc({
  sunrise,
  sunset,
  now,
  isDay,
}: {
  sunrise: string | null;
  sunset: string | null;
  now: Date | null;
  /** Ambient day/night (from the shared sun phase) — sets the ink so the arc
   *  reads on the day's cream panel as well as the night's navy one. */
  isDay: boolean;
}) {
  const riseMs = sunrise ? Date.parse(sunrise) : NaN;
  const setMs = sunset ? Date.parse(sunset) : NaN;
  const haveSun = Number.isFinite(riseMs) && Number.isFinite(setMs) && setMs > riseMs;

  const nowMs = (now ?? new Date()).getTime();
  const rawT = haveSun ? (nowMs - riseMs) / (setMs - riseMs) : 0;
  // Whether the sun is currently above the horizon (drives the marker + the lit
  // arc) — distinct from the ambient `isDay` ink, though they usually agree.
  const sunUp = haveSun && rawT >= 0 && rawT <= 1;
  const t = clamp01(rawT);

  const cx = sunX(t);
  const cy = sunY(t);

  // Hairlines follow the ink (navy on cream by day, cream on navy at night); the
  // arc + marker stay warm, deepening to camel by day so they hold on cream.
  const ink = (a: number) => `rgba(${inkTriplet(isDay)}, ${a})`;
  const warm = instrumentWarm(isDay);

  return (
    <div className="flex flex-col gap-4">
      <MetricLabel>Sun · 일출 · 일몰</MetricLabel>

      <svg viewBox="0 0 300 166" className="w-full" role="img" aria-label="일출에서 일몰까지의 태양 위치">
        <defs>
          <linearGradient id="sunArc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={warm} stopOpacity={0.18} />
            <stop offset="50%" stopColor={warm} stopOpacity={0.6} />
            <stop offset="100%" stopColor={warm} stopOpacity={0.18} />
          </linearGradient>
        </defs>

        {/* the horizon line */}
        <line x1="14" y1="150" x2="286" y2="150" stroke={ink(0.18)} strokeWidth={1} />

        {/* the full arc (faint), then the travelled portion painted brighter */}
        <path
          d="M20 150 A 130 130 0 0 1 280 150"
          fill="none"
          stroke={ink(0.16)}
          strokeWidth={1}
          strokeDasharray="2 4"
        />
        {sunUp && (
          <path
            d="M20 150 A 130 130 0 0 1 280 150"
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
          r={sunUp ? 5 : 3.5}
          fill={sunUp ? warm : ink(0.4)}
          style={sunUp ? { filter: `drop-shadow(0 0 6px ${warm})` } : undefined}
        />
      </svg>

      <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.12em] text-white/65">
        <span className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-[0.24em] text-white/45">일출</span>
          <span className="tabular-nums text-white/85">{sunrise ? formatKstTime(sunrise) : "—"}</span>
        </span>
        <span className="flex flex-col items-end gap-0.5">
          <span className="text-[9px] uppercase tracking-[0.24em] text-white/45">일몰</span>
          <span className="tabular-nums text-white/85">{sunset ? formatKstTime(sunset) : "—"}</span>
        </span>
      </div>
    </div>
  );
}
