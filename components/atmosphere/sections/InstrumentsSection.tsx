"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { airBandLabelEn, uvBandLabelEn } from "@/lib/atmosphere/weatherVisualConfig";
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

// ---- severity accent --------------------------------------------------------

/**
 * Returns a Tailwind bg class for the thin status accent bar at the bottom of
 * each card. Keyed to real-world severity so color carries meaning.
 *
 * Tunables: thresholds below; adjust to match local AQI/UV comfort ranges.
 *   precip: ≥15% shows sky, ≥50% upgrades to blue.
 *   uv:     WHO bands (3/6/8).
 *   air:    KMA bands 1–4.
 */
function accentClass(metric: "air" | "uv" | "precip", band: string | null, value: number | null): string | null {
  if (metric === "air") {
    if (band === "GOOD")      return "bg-emerald-400/75";
    if (band === "MODERATE")  return "bg-amber-300/75";
    if (band === "POOR")      return "bg-orange-400/80";
    if (band === "VERY POOR") return "bg-red-400/80";
    return null;
  }
  if (metric === "uv") {
    if (value == null) return null;
    if (value < 3)  return "bg-emerald-400/75";
    if (value < 6)  return "bg-amber-300/75";
    if (value < 8)  return "bg-orange-400/80";
    return "bg-red-400/80";
  }
  if (metric === "precip") {
    if (value == null || value < 15) return null;
    return value < 50 ? "bg-sky-400/70" : "bg-blue-400/80";
  }
  return null;
}

// ---- micro-viz --------------------------------------------------------------

function HumidityRing({ value }: { value: number | null }) {
  if (value == null) return null;
  const r = 13;
  const circ = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(value / 100, 1)) * circ;
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <circle cx="16" cy="16" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.8" />
      <circle
        cx="16" cy="16" r={r}
        fill="none"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="1.8"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 16 16)"
      />
    </svg>
  );
}

/** Four-segment band bar showing which AQI level is active. */
function AqiBand({ band }: { band: 1 | 2 | 3 | 4 | null }) {
  if (band == null) return null;
  const colors = ["bg-emerald-400", "bg-amber-300", "bg-orange-400", "bg-red-400"] as const;
  return (
    <div className="flex gap-[3px] pt-0.5" aria-hidden>
      {([1, 2, 3, 4] as const).map((b) => (
        <div
          key={b}
          className={`h-[3px] flex-1 rounded-full ${
            b === band ? `${colors[b - 1]} opacity-90` : "bg-white/14"
          }`}
        />
      ))}
    </div>
  );
}

// ---- wind arrow -------------------------------------------------------------

/**
 * Arrow that settles to the live downwind bearing on entrance, then sways
 * gently (via .wind-sway CSS animation on the SVG — see globals.css). The
 * sway uses the standalone `rotate` CSS property which composes cleanly with
 * Framer Motion's `transform: rotate()` on the parent wrapper.
 */
function WindArrow({ fromDeg, reduce }: { fromDeg: number | null; reduce: boolean }) {
  if (fromDeg == null) return null;
  const downwind = fromDeg + 180;
  const arrowSvg = (
    <svg
      width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={1.4}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden
      className="wind-sway text-white/65"
    >
      <line x1="12" y1="4" x2="12" y2="20" />
      <path d="M7 9l5-5 5 5" />
    </svg>
  );

  if (reduce) {
    return <div style={{ transform: `rotate(${downwind}deg)` }}>{arrowSvg}</div>;
  }
  return (
    <motion.div
      initial={{ rotate: 0 }}
      animate={{ rotate: downwind }}
      transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
    >
      {arrowSvg}
    </motion.div>
  );
}

// ---- tile card --------------------------------------------------------------

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.85, ease: [0.22, 1, 0.36, 1] as const },
  },
};

function Tile({
  label,
  value,
  unit,
  sub,
  corner,
  accent,
  microviz,
  reduce,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  corner?: ReactNode;
  accent?: string | null;
  microviz?: ReactNode;
  reduce: boolean;
}) {
  return (
    <motion.div variants={reduce ? {} : CARD_VARIANTS} className="h-full">
      <GlassPanel elevated radius="rounded-[18px]" className="h-full px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex min-h-[7.5rem] flex-col justify-between gap-5 sm:min-h-[9rem]">
          <div className="flex items-start justify-between gap-2">
            <MetricLabel>{label}</MetricLabel>
            {corner}
          </div>
          <div className="flex flex-col gap-1.5">
            <Value size="md" unit={unit}>
              {value}
            </Value>
            {sub != null && (
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">{sub}</span>
            )}
            {microviz}
          </div>
        </div>
        {/* Status accent bar — absolute relative to GlassPanel (position:relative). */}
        {accent && (
          <span
            className={`pointer-events-none absolute bottom-4 right-5 h-[3px] w-7 rounded-full ${accent}`}
          />
        )}
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

// ---- section ----------------------------------------------------------------

/**
 * Section 2 — Instruments. Six premium matte tiles reading the live surface
 * state: wind (speed + animated bearing arrow), humidity (with ring fill),
 * visibility, UV index, air quality (with AQI band bar), and precipitation
 * chance. On entrance (D key) tiles cascade in with a staggered fade+rise;
 * numeric values count up from 0. Both effects re-trigger on each entrance.
 * Status accents inject meaningful color: green=safe, amber=moderate,
 * orange/red=elevated. Desktop-only hover lift. All animations respect
 * prefers-reduced-motion.
 *
 * Tunables (see comments at each hook/function):
 *   - Count-up duration: useCountUp(..., 820) — 700–900ms is the sweet spot.
 *   - Stagger delay: GRID_VARIANTS.visible.transition.staggerChildren (0.07s).
 *   - Wind sway: globals.css @keyframes wind-sway (±2deg, 4s period).
 *   - Night bloom brightness: skyPalette.ts ambOpA/B/C/D floor values.
 *   - Accent thresholds: accentClass() — adjust per local AQI/UV comfort norms.
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
  const windRaw   = toMsNum(readout.windSpeed);
  const humidRaw  = toInt(readout.humidity);
  const visRaw    = readout.visibility == null ? null : Math.round(readout.visibility / 1000);
  const uvRaw     = toInt(readout.uvIndex);
  const airRaw    = readout.airValue == null ? null : toInt(readout.airValue);
  const precipRaw = toInt(readout.precipitationProbability);

  // Animated display values (each re-runs on entranceKey or target change).
  const windAnim   = useCountUp(windRaw,   entranceKey);
  const humidAnim  = useCountUp(humidRaw,  entranceKey);
  const visAnim    = useCountUp(visRaw,    entranceKey);
  const uvAnim     = useCountUp(uvRaw,     entranceKey);
  const airAnim    = useCountUp(airRaw,    entranceKey);
  const precipAnim = useCountUp(precipRaw, entranceKey);

  const windDisplay  = windAnim  == null ? "—" : windAnim.toFixed(1);
  const humidDisplay = humidAnim == null ? "—" : `${Math.round(humidAnim)}`;
  const visDisplay   = visAnim   == null ? "—" : `${Math.round(visAnim)}`;
  const uvDisplay    = uvAnim    == null ? "—" : `${Math.round(uvAnim)}`;
  const precipDisplay = precipAnim == null ? "—" : `${Math.round(precipAnim)}`;

  const uvBand   = uvBandLabelEn(readout.uvIndex);
  const airLabel = airBandLabelEn(readout.airBand);
  const airSub   = readout.airValue == null ? null : airLabel ? `${airLabel} · µg/m³` : "µg/m³";
  // When no numeric PM value: show band label as the main value (original behaviour).
  const airDisplay = airAnim == null ? (airLabel ?? "—") : `${Math.round(airAnim)}`;

  const windSub =
    readout.windDirection == null
      ? readout.windDirectionKo ?? null
      : `${readout.windDirectionKo} ${Math.round(readout.windDirection)}°`.trim();

  return (
    <SkySection>
      <SectionHeading index="02" en="Instruments" ko="계기" />
      {/* key={entranceKey} remounts the motion tree on each D-key entrance,
          resetting Framer Motion animation state so the stagger replays cleanly. */}
      <motion.div
        key={entranceKey}
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3"
        initial={reduce ? false : "hidden"}
        animate={isActive ? "visible" : "hidden"}
        variants={reduce ? {} : GRID_VARIANTS}
      >
        <Tile
          label="Wind"
          value={windDisplay}
          unit={windRaw == null ? undefined : "m/s"}
          sub={windSub}
          corner={<WindArrow fromDeg={readout.windDirection} reduce={reduce} />}
          reduce={reduce}
        />
        <Tile
          label="Humidity"
          value={humidDisplay}
          unit={humidRaw == null ? undefined : "%"}
          corner={<HumidityRing value={humidRaw} />}
          reduce={reduce}
        />
        <Tile
          label="Visibility"
          value={visDisplay}
          unit={visRaw == null ? undefined : "km"}
          reduce={reduce}
        />
        <Tile
          label="UV Index"
          value={uvDisplay}
          sub={uvBand}
          accent={accentClass("uv", null, readout.uvIndex)}
          reduce={reduce}
        />
        <Tile
          label="Air Quality"
          value={airDisplay}
          sub={airSub}
          accent={accentClass("air", airLabel, null)}
          microviz={<AqiBand band={readout.airBand} />}
          reduce={reduce}
        />
        <Tile
          label="Precipitation"
          value={precipDisplay}
          unit={precipRaw == null ? undefined : "%"}
          accent={accentClass("precip", null, precipRaw)}
          reduce={reduce}
        />
      </motion.div>
    </SkySection>
  );
}
