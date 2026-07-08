"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { dewPointC } from "@/lib/atmosphere/derive";
import GlassPanel from "../glass/GlassPanel";
import { MetricLabel, Value } from "../EtchedType";
import { useWeatherField, useWeatherView } from "../WeatherFieldContext";
import { SectionHeading, SkySection } from "./SectionParts";

// ---- count-up ---------------------------------------------------------------

/**
 * Animates a numeric value from its previous position to `target` over
 * `duration` ms (ease-out cubic). Resets to 0 on each new entrance (triggered
 * by `entranceKey` changing). Does nothing under prefers-reduced-motion.
 *
 * Tunables: duration controls the count-up speed (700–900ms feels premium).
 */
function useCountUp(target: number | null, entranceKey: number, duration = 820): number | null {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState<number | null>(null);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const prevKeyRef = useRef(entranceKey);

  useEffect(() => {
    if (target === null) {
      setDisplay(null);
      return;
    }
    if (reduce) {
      setDisplay(target);
      fromRef.current = target;
      return;
    }

    // New entrance → always start from 0 regardless of last displayed value.
    if (prevKeyRef.current !== entranceKey) {
      prevKeyRef.current = entranceKey;
      fromRef.current = 0;
    }

    const from = fromRef.current;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (target - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, entranceKey, reduce, duration]);

  return display;
}

// ---- shared viz vocabulary --------------------------------------------------
//
// Every tile carries ONE right-side visualization, drawn from a small, consistent
// kit so the six tiles read as a set rather than a zoo of idioms:
//   • angular metric (WIND)        → a compass dial
//   • cyclic 0–100 ratio (HUMIDITY)→ a fill ring
//   • every scalar metric          → the SAME horizontal gradient scale bar + dot
// All strokes/markers use `currentColor` (the panel ink, which flips with the
// backdrop-brightness signal) so nothing vanishes in either adaptive mode. The
// gradient stops below are the one place to tune the scale-bar palettes.

const SCALE_GRADIENTS = {
  // Hazy/low → clear/high (visibility reads "good" at the high end).
  visibility: "linear-gradient(90deg, rgba(148,163,184,0.55) 0%, #7dd3fc 60%, #e0f2fe 100%)",
  // WHO UV ramp: green → yellow → orange → red → violet.
  uv: "linear-gradient(90deg, #34d399 0%, #fde047 27%, #fb923c 52%, #f87171 73%, #c084fc 100%)",
  // KMA air bands 1→4: good → moderate → poor → very poor.
  air: "linear-gradient(90deg, #34d399 0%, #fbbf24 42%, #fb923c 70%, #f87171 100%)",
  // Precip probability: faint sky → saturated blue.
  precip: "linear-gradient(90deg, rgba(125,211,252,0.5) 0%, #38bdf8 55%, #3b82f6 100%)",
} as const;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * The shared scalar idiom: a horizontal gradient track with a position dot.
 * `pct` (0–100, null = unknown → no dot) places the marker. The dot is the panel
 * ink so it stays legible over any gradient stop in both modes; a panel-tinted
 * halo separates it from the band beneath. `lo`/`hi` caption the scale extremes.
 */
function ScaleBar({
  pct,
  gradient,
  lo,
  hi,
}: {
  pct: number | null;
  gradient: string;
  lo: string;
  hi: string;
}) {
  return (
    <div className="flex w-full flex-col gap-2">
      <div
        className="relative h-2.5 w-full rounded-full ring-1 ring-inset ring-white/15"
        style={{ background: gradient }}
        aria-hidden
      >
        {pct != null && (
          // The marker sits on the (mode-independent) gradient, so it is a FIXED
          // white dot with a dark ring + shadow — legible on every gradient stop
          // (pale or saturated) and in both adaptive backdrop modes.
          <span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
            style={{
              left: `${clamp01(pct / 100) * 100}%`,
              boxShadow: "0 0 0 1.5px rgba(2,6,20,0.6), 0 1px 4px rgba(0,0,0,0.45)",
            }}
          />
        )}
      </div>
      <div className="flex justify-between font-mono text-[10px] tracking-[0.12em] text-white">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
    </div>
  );
}

/** Humidity fill ring — enlarged. Strokes use currentColor so it follows the ink. */
function HumidityRing({ value }: { value: number | null }) {
  const r = 42;
  const circ = 2 * Math.PI * r;
  const dash = value == null ? 0 : clamp01(value / 100) * circ;
  return (
    <svg viewBox="0 0 100 100" className="h-[clamp(4.25rem,6.5vw,5.5rem)] w-[clamp(4.25rem,6.5vw,5.5rem)]" aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth="6" />
      {value != null && (
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.6}
          strokeWidth="6"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
      )}
    </svg>
  );
}

/**
 * Compass dial for wind. A static ring + cardinal ticks/labels, with a pointer
 * rotated to the reported bearing (north-up; a wind from 270° points the needle
 * west, agreeing with the "서 270°" sub-label). When the bearing is unknown the
 * dial shows with no pointer (never a fabricated 0°/N). The needle keeps the
 * gentle idle sway (.wind-sway, globals.css), disabled under reduced motion.
 */
function WindDial({ fromDeg }: { fromDeg: number | null }) {
  const has = fromDeg != null;
  const bearing = has ? ((fromDeg % 360) + 360) % 360 : 0;
  const size = "h-[clamp(4.25rem,6.5vw,5.5rem)] w-[clamp(4.25rem,6.5vw,5.5rem)]";
  const cardinals: [string, number, number][] = [
    ["북", 50, 13],
    ["동", 88, 53],
    ["남", 50, 92],
    ["서", 12, 53],
  ];
  return (
    <div className={`relative grid place-items-center ${size}`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeOpacity={0.16} strokeWidth="1.4" />
        {/* minor ticks every 30°, cardinal ticks longer */}
        {Array.from({ length: 12 }, (_, i) => {
          const major = i % 3 === 0;
          const a = (i * 30 * Math.PI) / 180;
          const r0 = major ? 38 : 41;
          const x1 = 50 + Math.sin(a) * r0;
          const y1 = 50 - Math.cos(a) * r0;
          const x2 = 50 + Math.sin(a) * 44;
          const y2 = 50 - Math.cos(a) * 44;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeOpacity={major ? 0.4 : 0.18}
              strokeWidth={major ? 1.4 : 1}
            />
          );
        })}
        {cardinals.map(([t, x, y]) => (
          <text
            key={t}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="currentColor"
            fillOpacity={1}
            style={{ fontSize: "9px", fontFamily: "var(--font-mono, monospace)" }}
          >
            {t}
          </text>
        ))}
      </svg>
      {has && (
        <div className="absolute inset-0" style={{ transform: `rotate(${bearing}deg)` }}>
          <svg viewBox="0 0 100 100" className="wind-sway h-full w-full" style={{ transformOrigin: "50px 50px" }} aria-hidden>
            {/* needle: a filled arrowhead at the rim (the FROM direction) + stem to centre */}
            <path d="M50 16 L45 28 L55 28 Z" fill="currentColor" fillOpacity={0.85} />
            <line x1="50" y1="27" x2="50" y2="62" stroke="currentColor" strokeOpacity={0.6} strokeWidth="2" strokeLinecap="round" />
            <circle cx="50" cy="50" r="3" fill="currentColor" fillOpacity={0.7} />
          </svg>
        </div>
      )}
    </div>
  );
}

// ---- tile icons (small, currentColor) ---------------------------------------

const ICON_PROPS = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const ICONS: Record<string, ReactNode> = {
  wind: (
    <svg {...ICON_PROPS}>
      <path d="M3 8h11a3 3 0 1 0-3-3" />
      <path d="M3 16h15a3 3 0 1 1-3 3" />
    </svg>
  ),
  humidity: (
    <svg {...ICON_PROPS}>
      <path d="M12 3s6 6.5 6 10.5A6 6 0 0 1 6 13.5C6 9.5 12 3 12 3z" />
    </svg>
  ),
  visibility: (
    <svg {...ICON_PROPS}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  ),
  uv: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </svg>
  ),
  air: (
    <svg {...ICON_PROPS}>
      <path d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5" />
      <path d="M3 12h15a2.5 2.5 0 1 1-2.5 2.5" />
      <path d="M3 16h8" />
    </svg>
  ),
  precip: (
    <svg {...ICON_PROPS}>
      <path d="M7 14a4 4 0 0 1 .5-7.9A5 5 0 0 1 17 7a3.5 3.5 0 0 1 .5 7" />
      <path d="M9 18l-1 2M13 18l-1 2M16 18l-1 2" />
    </svg>
  ),
};

// ---- tile card --------------------------------------------------------------

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.85, ease: [0.22, 1, 0.36, 1] as const },
  },
};

/**
 * One instrument tile. Apple Weather card anatomy: a small icon + uppercase label
 * top-left, the large primary value filling the left column (vertically centred,
 * not tucked in a corner), an optional honest supporting line beneath it, and a
 * right-side visualization that fills the wide card's otherwise-dead right half.
 */
function Tile({
  icon,
  label,
  value,
  unit,
  sub,
  viz,
  reduce,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  viz: ReactNode;
  reduce: boolean;
}) {
  return (
    <motion.div variants={reduce ? {} : CARD_VARIANTS} className="h-full">
      <GlassPanel elevated className="h-full px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex min-h-[8.5rem] items-stretch gap-3 sm:min-h-[10rem] sm:gap-4">
          {/* Left — label, large value, supporting line. Centred as a group so the
              value sits at the card's vertical middle rather than its lower edge. */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2.5">
            <div className="flex items-center gap-2 text-white">
              {icon}
              <MetricLabel tone="bright" className="!text-[13px]">
                {label}
              </MetricLabel>
            </div>
            <Value size="tile" unit={unit} unitFull>
              {value}
            </Value>
            {sub != null && (
              <span className="font-mono text-[12px] uppercase tracking-[0.18em] text-white">{sub}</span>
            )}
          </div>
          {/* Right — the metric's visualization, vertically centred, balancing the card. */}
          <div className="flex w-[42%] max-w-[10.5rem] shrink-0 items-center justify-center">{viz}</div>
        </div>
      </GlassPanel>
    </motion.div>
  );
}

// ---- stagger container variants ---------------------------------------------

const GRID_VARIANTS = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

// ---- helpers ----------------------------------------------------------------

const toInt = (n: number | null) => (n == null ? null : Math.round(n));
const toMsNum = (kmh: number | null) => (kmh == null ? null : kmh / 3.6);

// Honest qualitative bands (standard WHO/KMA cut points — derived, not invented).
const uvKo = (uv: number | null): string | null =>
  uv == null ? null : uv < 3 ? "낮음" : uv < 6 ? "보통" : uv < 8 ? "높음" : uv < 11 ? "매우 높음" : "위험";
const AIR_KO: Record<1 | 2 | 3 | 4, string> = { 1: "좋음", 2: "보통", 3: "나쁨", 4: "매우 나쁨" };
const AIR_POS: Record<1 | 2 | 3 | 4, number> = { 1: 14, 2: 40, 3: 66, 4: 90 };
const visKo = (m: number | null): string | null =>
  m == null ? null : m >= 10000 ? "맑은 시야" : m >= 6000 ? "양호" : m >= 2000 ? "연무" : "안개";

// ---- section ----------------------------------------------------------------

/**
 * Section 2 — Instruments. Six premium liquid-glass tiles reading the live surface
 * state: wind (speed + compass dial), humidity (+ fill ring & derived dew point),
 * visibility, UV index, air quality, and precipitation chance — the four scalars
 * sharing one horizontal gradient scale-bar idiom. On entrance (D key) tiles
 * cascade in with a staggered fade+rise; numeric values count up from 0. Both
 * effects re-trigger on each entrance. Missing values render "—" (never zero) and
 * their viz drops its marker — nothing is fabricated. Desktop-only hover lift; all
 * animation respects prefers-reduced-motion.
 *
 * Tunables:
 *   - Count-up duration: useCountUp(..., 820) — 700–900ms is the sweet spot.
 *   - Stagger delay: GRID_VARIANTS.visible.transition.staggerChildren (0.07s).
 *   - Wind sway: globals.css @keyframes wind-sway (±2deg, 4s period).
 *   - Scale-bar palettes: SCALE_GRADIENTS (top of file).
 *   - Value/label type scale: EtchedType `tile` size + the !text-[13px] label.
 */
export default function InstrumentsSection() {
  const { readout } = useWeatherField();
  const isActive = useWeatherView() === "data";
  const reduce = !!useReducedMotion();

  // Increment on each hero→data transition to re-trigger stagger + count-up.
  const [entranceKey, setEntranceKey] = useState(0);
  const prevActiveRef = useRef(false);
  useEffect(() => {
    if (isActive && !prevActiveRef.current) setEntranceKey((k) => k + 1);
    prevActiveRef.current = isActive;
  }, [isActive]);

  // Raw numerics (null when unavailable) for count-up hooks.
  const windRaw = toMsNum(readout.windSpeed);
  const humidRaw = toInt(readout.humidity);
  const visRaw = readout.visibility == null ? null : Math.round(readout.visibility / 1000);
  const uvRaw = toInt(readout.uvIndex);
  const airRaw = readout.airValue == null ? null : toInt(readout.airValue);
  const precipRaw = toInt(readout.precipitationProbability);

  // Animated display values (each re-runs on entranceKey or target change).
  const windAnim = useCountUp(windRaw, entranceKey);
  const humidAnim = useCountUp(humidRaw, entranceKey);
  const visAnim = useCountUp(visRaw, entranceKey);
  const uvAnim = useCountUp(uvRaw, entranceKey);
  const airAnim = useCountUp(airRaw, entranceKey);
  const precipAnim = useCountUp(precipRaw, entranceKey);

  const windDisplay = windAnim == null ? "—" : windAnim.toFixed(1);
  const humidDisplay = humidAnim == null ? "—" : `${Math.round(humidAnim)}`;
  const visDisplay = visAnim == null ? "—" : `${Math.round(visAnim)}`;
  const uvDisplay = uvAnim == null ? "—" : `${Math.round(uvAnim)}`;
  const precipDisplay = precipAnim == null ? "—" : `${Math.round(precipAnim)}`;

  const airKo = readout.airBand == null ? null : AIR_KO[readout.airBand];
  // The big value is always a number or "—" (never a long band word, which would
  // overflow the value slot at tile size). The band word rides the sub line, and
  // the scale-bar marker still encodes the level — so a band-without-PM source
  // shows "—" + e.g. "나쁨" + a positioned dot, honestly and without overflow.
  const airDisplay = airAnim == null ? "—" : `${Math.round(airAnim)}`;
  const airUnit = airRaw == null ? undefined : "µg/m³";

  // Supporting lines — all honest: derived (dew point) or standard band cut points.
  const windSub =
    readout.windDirection == null
      ? readout.windDirectionKo || null
      : `${readout.windDirectionKo} ${Math.round(readout.windDirection)}°`.trim();
  const dew = dewPointC(readout.temperature, readout.humidity);
  const humidSub = dew == null ? null : `이슬점 ${Math.round(dew)}°`;
  const visSub = visKo(readout.visibility);
  const uvSub = uvKo(readout.uvIndex);
  const airSub = airKo; // qualitative band word, always the sub when a band exists
  const precipSub = precipRaw === 0 ? "강수 없음" : precipRaw != null ? "현재 시각" : null;

  // Scale-bar marker positions (null → no dot, never a fabricated 0).
  const visPct = readout.visibility == null ? null : clamp01(readout.visibility / 20000) * 100;
  const uvPct = readout.uvIndex == null ? null : clamp01(readout.uvIndex / 11) * 100;
  const airPct = readout.airBand == null ? null : AIR_POS[readout.airBand];
  const precipPct = precipRaw;

  return (
    <SkySection>
      <SectionHeading index="02" en="Current Conditions" ko="지금 상태" />
      {/* Heading stays pinned at the section top; the grid centres in the space
          below it (equal top/bottom) so the deck never sits top-weighted. */}
      <div className="flex flex-1 flex-col justify-center">
        {/* key={entranceKey} remounts the motion tree on each D-key entrance,
            resetting Framer Motion animation state so the stagger replays cleanly. */}
        <motion.div
          key={entranceKey}
          className="mx-auto grid w-full max-w-[80rem] grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          initial={reduce ? false : "hidden"}
          animate={isActive ? "visible" : "hidden"}
          variants={reduce ? {} : GRID_VARIANTS}
        >
          <Tile
            icon={ICONS.wind}
            label="Wind"
            value={windDisplay}
            unit={windRaw == null ? undefined : "m/s"}
            sub={windSub}
            viz={<WindDial fromDeg={readout.windDirection} />}
            reduce={reduce}
          />
          <Tile
            icon={ICONS.humidity}
            label="Humidity"
            value={humidDisplay}
            unit={humidRaw == null ? undefined : "%"}
            sub={humidSub}
            viz={<HumidityRing value={humidRaw} />}
            reduce={reduce}
          />
          <Tile
            icon={ICONS.visibility}
            label="Visibility"
            value={visDisplay}
            unit={visRaw == null ? undefined : "km"}
            sub={visSub}
            viz={<ScaleBar pct={visPct} gradient={SCALE_GRADIENTS.visibility} lo="0" hi="20km" />}
            reduce={reduce}
          />
          <Tile
            icon={ICONS.uv}
            label="UV Index"
            value={uvDisplay}
            sub={uvSub}
            viz={<ScaleBar pct={uvPct} gradient={SCALE_GRADIENTS.uv} lo="0" hi="11+" />}
            reduce={reduce}
          />
          <Tile
            icon={ICONS.air}
            label="Air Quality"
            value={airDisplay}
            unit={airUnit}
            sub={airSub}
            viz={<ScaleBar pct={airPct} gradient={SCALE_GRADIENTS.air} lo="좋음" hi="매우나쁨" />}
            reduce={reduce}
          />
          <Tile
            icon={ICONS.precip}
            label="Precipitation"
            value={precipDisplay}
            unit={precipRaw == null ? undefined : "%"}
            sub={precipSub}
            viz={<ScaleBar pct={precipPct} gradient={SCALE_GRADIENTS.precip} lo="0" hi="100%" />}
            reduce={reduce}
          />
        </motion.div>
      </div>
    </SkySection>
  );
}
