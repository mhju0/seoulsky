"use client";

import type { ReactNode } from "react";
import { airBandLabelEn, uvBandLabelEn } from "@/lib/atmosphere/weatherVisualConfig";
import GlassPanel from "../glass/GlassPanel";
import { MetricLabel, Value } from "../EtchedType";
import { ScrollReveal } from "../descentMotion";
import { useWeatherField } from "../WeatherFieldContext";
import { SectionHeading, SkySection } from "./SectionParts";

/**
 * Section 2 — Instruments. Six liquid-glass tiles reading the live surface state:
 * wind (speed + bearing arrow), humidity, visibility, UV index, air quality, and
 * precipitation chance. Each tile is a mono small-caps label, a large light value,
 * and a unit; they reveal in a soft stagger as the section scrolls in. All values
 * degrade to "—" so a partial snapshot never shows a broken tile.
 */

const round = (n: number | null) => (n == null ? "—" : `${Math.round(n)}`);
/** km/h → m/s, matching the rest of the experience. */
const toMs = (kmh: number | null) => (kmh == null ? "—" : (kmh / 3.6).toFixed(1));

/** A small arrow pointing the way the wind blows (downwind), or null when unknown. */
function WindArrow({ fromDeg }: { fromDeg: number | null }) {
  if (fromDeg == null) return null;
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-white/65"
      style={{ transform: `rotate(${fromDeg + 180}deg)` }}
    >
      <line x1="12" y1="4" x2="12" y2="20" />
      <path d="M7 9l5-5 5 5" />
    </svg>
  );
}

function Tile({
  label,
  value,
  unit,
  sub,
  corner,
  delay,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  corner?: ReactNode;
  delay: number;
}) {
  return (
    <ScrollReveal delay={delay} amount={0.2} y={22}>
      <GlassPanel radius="rounded-[18px]" className="h-full px-5 py-5 sm:px-6 sm:py-6">
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
          </div>
        </div>
      </GlassPanel>
    </ScrollReveal>
  );
}

export default function InstrumentsSection() {
  const { readout } = useWeatherField();

  const windMs = toMs(readout.windSpeed);
  const windSub =
    readout.windDirection == null
      ? readout.windDirectionKo || null
      : `${readout.windDirectionKo} ${Math.round(readout.windDirection)}°`.trim();

  const visKm = readout.visibility == null ? "—" : `${Math.round(readout.visibility / 1000)}`;

  const uvBand = uvBandLabelEn(readout.uvIndex);
  const airLabel = airBandLabelEn(readout.airBand);
  const airValue = readout.airValue == null ? airLabel ?? "—" : round(readout.airValue);
  const airSub = readout.airValue == null ? null : airLabel ? `${airLabel} · µg/m³` : "µg/m³";

  return (
    <SkySection>
      <SectionHeading index="02" en="Instruments" ko="계기" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Tile
          label="Wind"
          value={windMs}
          unit={windMs === "—" ? undefined : "m/s"}
          sub={windSub}
          corner={<WindArrow fromDeg={readout.windDirection} />}
          delay={0}
        />
        <Tile
          label="Humidity"
          value={round(readout.humidity)}
          unit={readout.humidity == null ? undefined : "%"}
          delay={0.06}
        />
        <Tile
          label="Visibility"
          value={visKm}
          unit={visKm === "—" ? undefined : "km"}
          delay={0.12}
        />
        <Tile
          label="UV Index"
          value={round(readout.uvIndex)}
          sub={uvBand}
          delay={0.18}
        />
        <Tile label="Air Quality" value={airValue} sub={airSub} delay={0.24} />
        <Tile
          label="Precipitation"
          value={round(readout.precipitationProbability)}
          unit={readout.precipitationProbability == null ? undefined : "%"}
          delay={0.3}
        />
      </div>
    </SkySection>
  );
}
