"use client";

import type { SkyRadar } from "@/lib/types";
import { airBandLabelEn } from "@/lib/atmosphere/weatherVisualConfig";
import { useWeatherField } from "../WeatherFieldContext";
import { HairlineRule, MetricLabel, Metric } from "../EtchedType";
import { ScrollReveal } from "../descentMotion";
import BandHeading from "./BandHeading";

/**
 * Band 4 — Surface Weather. The most "live" band: precipitation now, the chance
 * of rain, the air you would actually breathe, and the radar approach signal.
 * The radar summary states ONLY what RainViewer observed (no fabricated warnings;
 * direction is shown only when the frame analysis supports it) and carries the
 * required RainViewer attribution.
 */

const round = (n: number | null) => (n == null ? "—" : `${Math.round(n)}`);

/** Honest one-line radar approach summary — never invents a direction. */
function radarSummary(radar: SkyRadar | null | undefined): string {
  if (!radar) return "레이더 관측 없음";
  if (radar.approaching && radar.fromDirection) return `${radar.fromDirection}쪽에서 비구름 접근 중`;
  if (radar.precipNearby) return "서울 부근에 강수 관측";
  return "접근하는 비구름 없음";
}

export default function SurfaceBand() {
  const { readout, snapshot } = useWeatherField();

  const precip = snapshot?.current.precipitation ?? null;
  const airLabel = airBandLabelEn(readout.airBand);
  const airValue = readout.airValue == null ? airLabel ?? "—" : round(readout.airValue);
  const airSub =
    readout.airValue == null ? null : airLabel ? `${airLabel} · µg/m³` : "µg/m³";

  return (
    <ScrollReveal className="max-w-[820px]">
      <BandHeading index="04" en="Surface Weather" ko="지표 기상" />

      <div className="flex flex-wrap gap-x-14 gap-y-10">
        <Metric
          label="Precipitation"
          value={precip == null ? "—" : precip.toFixed(precip < 10 ? 1 : 0)}
          unit={precip == null ? undefined : "mm"}
          size="lg"
        />
        <Metric
          label="Rain Chance"
          value={round(readout.precipitationProbability)}
          unit={readout.precipitationProbability == null ? undefined : "%"}
          size="lg"
        />
        <Metric label="Air Quality" value={airValue} sub={airSub} size="lg" />
      </div>

      <HairlineRule className="mt-12 max-w-[420px]" />

      {/* Radar approach — observed signal only, with RainViewer attribution. */}
      <div className="mt-8 flex flex-col gap-2">
        <MetricLabel>Radar Approach</MetricLabel>
        <p className="font-sans text-xl font-light tracking-wide text-white/90 [text-shadow:0_1px_14px_rgba(0,0,0,0.5)]">
          {radarSummary(snapshot?.radar)}
        </p>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">© RainViewer</span>
      </div>
    </ScrollReveal>
  );
}
