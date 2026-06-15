"use client";

import type { ReactNode } from "react";
import {
  airBandLabelEn,
  uvBandLabelEn,
  type AtmosphereReadout,
} from "@/lib/atmosphere/weatherVisualConfig";

/**
 * The restrained bottom metric rail: up to six supporting readings, each a small
 * line icon + an uppercase label + the real value, separated by thin dividers on
 * desktop and reflowed into a 3-column grid on mobile. The values are the
 * readable part (warm white, tabular); anything missing degrades to "—" rather
 * than collapsing the rail. No cards, no heavy glass — just a quiet rail with a
 * subtle top border so it stays legible over the living field.
 */

const round = (n: number | null) => (n == null ? "—" : `${Math.round(n)}`);

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  humidity: (
    <Svg>
      <path d="M12 3s6 6.4 6 10.5a6 6 0 1 1-12 0C6 9.4 12 3 12 3z" />
    </Svg>
  ),
  wind: (
    <Svg>
      <path d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5" />
      <path d="M3 12h14a3 3 0 1 1-3 3" />
      <path d="M3 16h7" />
    </Svg>
  ),
  rain: (
    <Svg>
      <path d="M6 13a4 4 0 0 1 1-7.8A5 5 0 0 1 16.5 6 3.5 3.5 0 0 1 17.5 13" />
      <path d="M8 17l-1 3" />
      <path d="M12 17l-1 3" />
      <path d="M16 17l-1 3" />
    </Svg>
  ),
  visibility: (
    <Svg>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="2.6" />
    </Svg>
  ),
  uv: (
    <Svg>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" />
    </Svg>
  ),
  air: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden>
      <circle cx="7.5" cy="9" r="1.7" />
      <circle cx="14" cy="6.5" r="1.3" />
      <circle cx="16.5" cy="14" r="1.9" />
      <circle cx="9" cy="15.5" r="1.4" />
    </svg>
  ),
};

function Metric({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div className="flex items-center gap-2.5 sm:flex-1 sm:border-l sm:border-white/15 sm:pl-5 sm:first:border-l-0 sm:first:pl-0">
      <span className="shrink-0 text-white/70">{icon}</span>
      <div className="flex min-w-0 flex-col">
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/60">{label}</span>
        <span className="font-sans text-lg tabular-nums text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.5)] sm:text-xl">
          {value}
          {sub && value !== "—" && <span className="ml-1 text-xs text-white/55">{sub}</span>}
        </span>
      </div>
    </div>
  );
}

export default function WeatherMetricRail({ readout }: { readout: AtmosphereReadout }) {
  const windMs = readout.windSpeed == null ? "—" : (readout.windSpeed / 3.6).toFixed(1);
  const visKm = readout.visibility == null ? "—" : `${Math.round(readout.visibility / 1000)}`;
  const air = airBandLabelEn(readout.airBand);
  const airValue = readout.airValue == null ? air ?? "—" : round(readout.airValue);
  const airSub = readout.airValue == null ? null : air;

  return (
    <div className="relative grid grid-cols-2 gap-x-3 gap-y-6 rounded-2xl px-1 py-1 min-[430px]:grid-cols-3 sm:flex sm:flex-nowrap sm:items-center sm:gap-0 sm:rounded-none sm:border-t sm:border-white/10 sm:bg-gradient-to-t sm:from-black/45 sm:to-transparent sm:px-2 sm:pt-5">
      <Metric icon={ICONS.humidity} label="Humidity" value={round(readout.humidity)} sub={readout.humidity == null ? null : "%"} />
      <Metric icon={ICONS.wind} label="Wind" value={windMs} sub={windMs === "—" ? null : "m/s"} />
      <Metric icon={ICONS.rain} label="Rain" value={round(readout.precipitationProbability)} sub={readout.precipitationProbability == null ? null : "%"} />
      <Metric icon={ICONS.visibility} label="Visibility" value={visKm} sub={visKm === "—" ? null : "km"} />
      <Metric icon={ICONS.uv} label="UV Index" value={round(readout.uvIndex)} sub={uvBandLabelEn(readout.uvIndex)} />
      <Metric icon={ICONS.air} label="Air Quality" value={airValue} sub={airSub} />
    </div>
  );
}
