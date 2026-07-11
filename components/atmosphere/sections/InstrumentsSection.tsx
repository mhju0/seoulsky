"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { dewPointC } from "@/lib/atmosphere/derive";
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

// ---- reading icons (small, currentColor) ------------------------------------

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

// ---- entrance variants --------------------------------------------------------

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.85, ease: [0.22, 1, 0.36, 1] as const },
  },
};

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

// ---- section ----------------------------------------------------------------

/**
 * Section 2 — 현재 날씨. Five live readings — precipitation chance, wind,
 * humidity, air quality, UV — laid out as ONE full-width bordered strip of
 * equal columns, the same grid treatment the forecast section below uses, so
 * both sections read as a single aligned system. Each column is just
 * label → large numeral → quiet sub-line: no dials, rings, or gradient bars,
 * so the state of the sky reads in one pass.
 *
 * On entrance (D key) the columns cascade in with a staggered fade+rise and the
 * numerals count up from 0; both re-trigger on each entrance. Missing values
 * render "—" (never zero) — nothing is fabricated. All animation respects
 * prefers-reduced-motion.
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
  const uvRaw = toInt(readout.uvIndex);
  const airRaw = readout.airValue == null ? null : toInt(readout.airValue);
  const precipRaw = toInt(readout.precipitationProbability);

  // Animated display values (each re-runs on entranceKey or target change).
  const windAnim = useCountUp(windRaw, entranceKey);
  const humidAnim = useCountUp(humidRaw, entranceKey);
  const uvAnim = useCountUp(uvRaw, entranceKey);
  const airAnim = useCountUp(airRaw, entranceKey);
  const precipAnim = useCountUp(precipRaw, entranceKey);

  // Supporting lines — all honest: derived (dew point) or standard band cut points.
  const windSub =
    readout.windDirection == null
      ? readout.windDirectionKo || null
      : `${readout.windDirectionKo} ${Math.round(readout.windDirection)}°`.trim();
  const dew = dewPointC(readout.temperature, readout.humidity);
  const airKo = readout.airBand == null ? null : AIR_KO[readout.airBand];

  const readings: {
    key: string;
    icon: ReactNode;
    label: string;
    value: string;
    unit?: string;
    sub: string | null;
  }[] = [
    {
      key: "precip",
      icon: ICONS.precip,
      label: "강수 확률",
      value: precipAnim == null ? "—" : `${Math.round(precipAnim)}`,
      unit: precipRaw == null ? undefined : "%",
      sub: null,
    },
    {
      key: "wind",
      icon: ICONS.wind,
      label: "바람",
      value: windAnim == null ? "—" : windAnim.toFixed(1),
      unit: windRaw == null ? undefined : "m/s",
      sub: windSub,
    },
    {
      key: "humidity",
      icon: ICONS.humidity,
      label: "습도",
      value: humidAnim == null ? "—" : `${Math.round(humidAnim)}`,
      unit: humidRaw == null ? undefined : "%",
      sub: dew == null ? null : `이슬점 ${Math.round(dew)}°`,
    },
    {
      // The big value is always a number or "—" (never a long band word). The
      // band word rides the sub line — so a band-without-PM source shows
      // "—" + e.g. "나쁨", honestly and without overflow.
      key: "air",
      icon: ICONS.air,
      label: "대기질",
      value: airAnim == null ? "—" : `${Math.round(airAnim)}`,
      unit: airRaw == null ? undefined : "µg/m³",
      sub: `미세먼지 ${airKo ?? "관측 없음"}`,
    },
    {
      key: "uv",
      icon: ICONS.uv,
      label: "자외선",
      value: uvAnim == null ? "—" : `${Math.round(uvAnim)}`,
      sub: uvKo(readout.uvIndex) ?? "관측 없음",
    },
  ];

  return (
    <SkySection id="air" compact>
      <SectionHeading index="02" title="현재 날씨" compact />
      <div className="mx-auto flex w-full max-w-[80rem] flex-1 flex-col justify-center">
        <div className="scroll-thin overflow-x-auto border-y border-white/18">
          <motion.ol
            key={entranceKey}
            className="grid min-w-[42rem] grid-cols-5"
            aria-label="현재 관측 — 강수확률·바람·습도·대기질·자외선"
            initial={reduce ? false : "hidden"}
            animate={isActive ? "visible" : "hidden"}
            variants={reduce ? {} : GRID_VARIANTS}
          >
            {readings.map((r) => (
              <motion.li
                key={r.key}
                variants={reduce ? {} : CARD_VARIANTS}
                className="flex min-h-[13rem] flex-col justify-between gap-6 border-l border-white/14 px-4 py-5 first:border-l-0"
              >
                <div className="flex items-center gap-2 text-white/85">
                  {r.icon}
                  <MetricLabel tone="bright">{r.label}</MetricLabel>
                </div>
                <div>
                  <Value size="md" unit={r.unit} unitFull>
                    {r.value}
                  </Value>
                  {/* Non-breaking space keeps the sub-line slot so all five
                      numerals sit on one shared baseline across the strip. */}
                  <span className="mt-3 block break-keep font-sans text-xs tracking-[0.08em] text-white/72">
                    {r.sub ?? " "}
                  </span>
                </div>
              </motion.li>
            ))}
          </motion.ol>
        </div>
      </div>
    </SkySection>
  );
}
