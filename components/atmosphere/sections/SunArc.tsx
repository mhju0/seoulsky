"use client";

import { formatKstTime } from "@/lib/format";
import { inkTriplet, instrumentWarm } from "@/lib/cinematic/skyPalette";
import { MetricLabel } from "../EtchedType";

/**
 * A full-circle 24-hour day/night dial split by the horizon line.
 *
 *   • Upper half = daytime. The sun rides from sunrise (left horizon crossing)
 *     over the top (noon) to sunset (right crossing), positioned by the current
 *     Seoul instant.
 *   • Lower half = night. The marker continues along the bottom from sunset
 *     through solar midnight to the next sunrise, and the glyph swaps to a moon.
 *
 * Day vs night is derived from the real sunrise/sunset in the snapshot, so the
 * dial is never blank — unlike the old half-arc, which went dark between sunset
 * and sunrise. The moon glyph carries the REAL phase, computed deterministically
 * from the date (no API). Honesty note: the moon's POSITION on the dial is the
 * clock position within the night (sunset→sunrise progress), NOT its true sky
 * altitude — the phase is real, the position is a time-of-night indicator.
 *
 * Pure SVG geometry. The marker re-positions on the shared per-second clock (the
 * `now` prop) — there is no tween/animation and no per-frame state.
 */

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

const DAY_MS = 86_400_000;

// A full circle of radius R about centre (CX, CY). The horizon is the horizontal
// diameter: sunrise rides the LEFT crossing, sunset the RIGHT. Day = upper half
// (sun left→top→right); night = lower half (right→bottom→left).
const R = 116;
const CX = 150;
const CY = 150;
const dayX = (dp: number) => CX - R * Math.cos(Math.PI * dp);
const dayY = (dp: number) => CY - R * Math.sin(Math.PI * dp);
const nightX = (np: number) => CX + R * Math.cos(Math.PI * np);
const nightY = (np: number) => CY + R * Math.sin(Math.PI * np);

// ---- moon phase (deterministic, date-only) ---------------------------------

const SYNODIC_MONTH = 29.530_588_853; // days between new moons
const REF_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14); // a known new moon (UTC)

/** Moon phase as a 0–1 fraction of the synodic month (0 = new, 0.5 = full). */
function moonPhaseFraction(at: Date): number {
  const days = (at.getTime() - REF_NEW_MOON_MS) / DAY_MS;
  const f = (days / SYNODIC_MONTH) % 1;
  return f < 0 ? f + 1 : f;
}

const MOON_NAMES_KO = [
  "신월",
  "초승달",
  "상현달",
  "차오르는 달",
  "보름달",
  "기우는 달",
  "하현달",
  "그믐달",
] as const;
function moonPhaseNameKo(f: number): string {
  return MOON_NAMES_KO[Math.round(f * 8) % 8];
}

/** "X시간 Y분" until the next horizon crossing (or "Y분" under an hour). */
function formatUntil(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h <= 0 ? `${m}분` : `${h}시간 ${m}분`;
}

// ---- moon glyph -------------------------------------------------------------

/**
 * A small moon disc carrying the real phase. Built from three plain shapes (no
 * masks): a dim full disc (so the unlit limb still reads on the navy panel), the
 * lit half-disc, then a terminator ellipse that either carves the lit half (a
 * crescent) or extends it onto the dark half (gibbous). At the quarters the
 * terminator collapses to a straight line. Colours are literal moonlight tones —
 * the glyph only ever renders at night, over the navy panel.
 */
function MoonGlyph({ x, y, phase }: { x: number; y: number; phase: number }) {
  const r = 8;
  const k = (1 - Math.cos(2 * Math.PI * phase)) / 2; // illuminated fraction 0..1
  const rx = r * Math.abs(Math.cos(2 * Math.PI * phase)); // terminator semi-width
  const waxing = phase < 0.5; // lit limb on the right while waxing
  const crescent = k < 0.5;
  const litHalf = waxing
    ? `M0 ${-r} A ${r} ${r} 0 0 1 0 ${r} Z` // right half-disc
    : `M0 ${-r} A ${r} ${r} 0 0 0 0 ${r} Z`; // left half-disc

  const LIT = "#eef0f7";
  const SHADOW = "#3a4566"; // a touch lighter than the night panel so the disc reads

  return (
    <g transform={`translate(${x} ${y})`} style={{ filter: "drop-shadow(0 0 5px rgba(214,224,248,0.45))" }}>
      <circle r={r} fill={SHADOW} stroke="rgba(228,232,244,0.4)" strokeWidth={0.7} />
      <path d={litHalf} fill={LIT} />
      {/* Terminator. Skipped only at the quarters, where rx≈0 makes it a no-op
          (the half-disc is already exactly right); near new/full it is REQUIRED
          to cover the lit half / extend onto the dark half. */}
      {rx > 0.25 && <ellipse rx={rx} ry={r} fill={crescent ? SHADOW : LIT} />}
    </g>
  );
}

export default function SunArc({
  sunrise,
  sunset,
  now,
  isDay,
}: {
  sunrise: string | null;
  sunset: string | null;
  now: Date | null;
  /** Ambient day/night (from the shared sun phase) — sets the panel ink so the
   *  dial reads on the day's cream panel as well as the night's navy one. */
  isDay: boolean;
}) {
  const riseMs = sunrise ? Date.parse(sunrise) : NaN;
  const setMs = sunset ? Date.parse(sunset) : NaN;
  const haveSun = Number.isFinite(riseMs) && Number.isFinite(setMs) && setMs > riseMs;

  const nowMs = (now ?? new Date()).getTime();

  // Place the marker and pick the mode from the real horizon crossings. Night
  // spans either sunset→next-sunrise (evening) or prev-sunset→sunrise (pre-dawn);
  // the adjacent crossing is approximated as ±24h — fine for a clock indicator.
  let mode: "day" | "night" = "night";
  let frac = 0; // day-progress (dp) or night-progress (np)
  let untilMs = 0; // time to the next horizon crossing
  if (haveSun) {
    if (nowMs >= riseMs && nowMs <= setMs) {
      mode = "day";
      frac = (nowMs - riseMs) / (setMs - riseMs);
      untilMs = setMs - nowMs; // until sunset
    } else if (nowMs > setMs) {
      const nextRise = riseMs + DAY_MS;
      mode = "night";
      frac = (nowMs - setMs) / (nextRise - setMs);
      untilMs = nextRise - nowMs; // until next sunrise
    } else {
      const prevSet = setMs - DAY_MS;
      mode = "night";
      frac = (nowMs - prevSet) / (riseMs - prevSet);
      untilMs = riseMs - nowMs; // until today's sunrise
    }
  }
  frac = clamp01(frac);

  const markerX = mode === "day" ? dayX(frac) : nightX(frac);
  const markerY = mode === "day" ? dayY(frac) : nightY(frac);

  const phaseFrac = moonPhaseFraction(now ?? new Date());
  const moonName = moonPhaseNameKo(phaseFrac);

  // Hairlines follow the ink (navy on cream by day, cream on navy at night); the
  // sun marker + the day arc stay warm so they hold on either surface.
  const ink = (a: number) => `rgba(${inkTriplet(isDay)}, ${a})`;
  const warm = instrumentWarm(isDay);

  const ariaLabel = !haveSun
    ? "24시간 해·달 다이얼 — 일출·일몰 데이터 없음"
    : mode === "day"
      ? `24시간 해·달 다이얼. 태양이 일출에서 일몰까지 위쪽 반원의 현재 시각 위치에 있습니다. 일몰까지 약 ${formatUntil(untilMs)}.`
      : `24시간 해·달 다이얼. 밤에는 달이 아래쪽 반원의 현재 시각 위치에 표시됩니다 (달의 실제 고도가 아니라 밤 시간의 진행). 오늘 달 위상은 ${moonName}. 일출까지 약 ${formatUntil(untilMs)}.`;

  return (
    <div className="flex flex-col gap-4">
      <MetricLabel>Sun &amp; Moon · 해 · 달</MetricLabel>

      <div className="mx-auto w-full max-w-[248px]">
        <svg viewBox="0 0 300 300" className="w-full" role="img" aria-label={ariaLabel}>
          <defs>
            <linearGradient id="sunDayArc" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={warm} stopOpacity={0.18} />
              <stop offset="50%" stopColor={warm} stopOpacity={0.6} />
              <stop offset="100%" stopColor={warm} stopOpacity={0.18} />
            </linearGradient>
          </defs>

          {/* night ground — a faint fill under the horizon */}
          <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 0 ${CX + R} ${CY} Z`} fill={ink(0.05)} />

          {/* the two dial halves (faint), each dashed; day arc warm, night cool */}
          <path
            d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
            fill="none"
            stroke={ink(0.18)}
            strokeWidth={1}
            strokeDasharray="2 4"
          />
          <path
            d={`M ${CX + R} ${CY} A ${R} ${R} 0 0 1 ${CX - R} ${CY}`}
            fill="none"
            stroke={ink(0.13)}
            strokeWidth={1}
            strokeDasharray="2 4"
          />

          {/* travelled portion of the current half, painted brighter */}
          {haveSun && mode === "day" && (
            <path
              d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
              fill="none"
              stroke="url(#sunDayArc)"
              strokeWidth={1.5}
              pathLength={1}
              strokeDasharray={`${frac} 1`}
            />
          )}
          {haveSun && mode === "night" && (
            <path
              d={`M ${CX + R} ${CY} A ${R} ${R} 0 0 1 ${CX - R} ${CY}`}
              fill="none"
              stroke={ink(0.4)}
              strokeWidth={1.4}
              pathLength={1}
              strokeDasharray={`${frac} 1`}
            />
          )}

          {/* the horizon line + its two crossings (sunrise left, sunset right) */}
          <line x1={CX - R - 8} y1={CY} x2={CX + R + 8} y2={CY} stroke={ink(0.22)} strokeWidth={1} />
          <circle cx={CX - R} cy={CY} r={3} fill={warm} opacity={0.85} />
          <circle cx={CX + R} cy={CY} r={3} fill={warm} opacity={0.85} />

          {/* the current marker: sun above the horizon, moon below */}
          {haveSun &&
            (mode === "day" ? (
              <circle
                cx={markerX}
                cy={markerY}
                r={6.5}
                fill={warm}
                style={{ filter: `drop-shadow(0 0 7px ${warm})` }}
              />
            ) : (
              <MoonGlyph x={markerX} y={markerY} phase={phaseFrac} />
            ))}
        </svg>
      </div>

      <div className="flex items-end justify-between gap-2 font-mono text-[11px] tracking-[0.12em] text-white/65">
        <span className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-[0.24em] text-white/45">일출</span>
          <span className="tabular-nums text-white/85">{sunrise ? formatKstTime(sunrise) : "—"}</span>
        </span>

        <span className="flex flex-col items-center gap-0.5 text-center">
          <span className="text-[9px] uppercase tracking-[0.24em] text-white/45">
            {mode === "night" ? "일출까지" : "일몰까지"}
          </span>
          <span className="font-sans text-sm font-light tabular-nums text-white/90">
            {haveSun ? formatUntil(untilMs) : "—"}
          </span>
          {haveSun && mode === "night" && (
            <span className="text-[9px] tracking-[0.16em] text-white/45">달 위상 · {moonName}</span>
          )}
        </span>

        <span className="flex flex-col items-end gap-0.5">
          <span className="text-[9px] uppercase tracking-[0.24em] text-white/45">일몰</span>
          <span className="tabular-nums text-white/85">{sunset ? formatKstTime(sunset) : "—"}</span>
        </span>
      </div>
    </div>
  );
}
