"use client";

import {
  airBandLabelEn,
  type AtmosphereReadout,
} from "@/lib/atmosphere/weatherVisualConfig";

/**
 * Up to five supporting metrics under the main block. Small uppercase labels are
 * decorative; the values are the readable part (warm white, tabular). Anything
 * missing degrades to "—" rather than disappearing or breaking the grid.
 */

const round = (n: number | null) => (n == null ? "—" : `${Math.round(n)}`);

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.28em] text-white/45">{label}</span>
      <span className="font-sans text-xl tabular-nums text-white/90">
        {value}
        {unit && value !== "—" && <span className="ml-1 text-xs text-white/45">{unit}</span>}
      </span>
    </div>
  );
}

export default function WeatherMetricRail({ readout }: { readout: AtmosphereReadout }) {
  const windMs = readout.windSpeed == null ? "—" : (readout.windSpeed / 3.6).toFixed(1);
  const visKm = readout.visibility == null ? "—" : `${Math.round(readout.visibility / 1000)}`;
  const air = airBandLabelEn(readout.airBand) ?? "—";

  return (
    <div className="mt-7 grid max-w-[min(92vw,640px)] grid-cols-2 gap-x-8 gap-y-5 sm:flex sm:flex-wrap sm:gap-x-11">
      <Metric label="Humidity" value={round(readout.humidity)} unit="%" />
      <Metric label="Wind" value={windMs} unit="m/s" />
      <Metric label="Rain" value={round(readout.precipitationProbability)} unit="%" />
      <Metric label="Visibility" value={visKm} unit="km" />
      <Metric label="Air Quality" value={air} />
    </div>
  );
}
