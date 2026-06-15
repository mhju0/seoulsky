"use client";

import { createContext, useContext } from "react";
import type { WeatherStatus } from "@/hooks/useLiveSeoulWeather";
import type { AtmosphereReadout, VisualConfig } from "@/lib/atmosphere/weatherVisualConfig";
import type { SkySnapshot } from "@/lib/types";

/**
 * Live state shared by every view rendered inside the {@link WeatherExperienceShell}.
 * The shell fetches Seoul weather once and computes the visual target + readout;
 * AtmosphereView and DiagnosticsView read from here instead of re-fetching, so
 * the two routes drive the SAME atmospheric field from a single data source.
 */
export interface WeatherFieldValue {
  snapshot: SkySnapshot | null;
  status: WeatherStatus;
  lastUpdatedAt: number | null;
  readout: AtmosphereReadout;
  /** The current clamped visual target (also exposes the weather accent colour). */
  target: VisualConfig;
  /** Seoul clock instant, or null before first client tick. */
  clock: Date | null;
}

const WeatherFieldContext = createContext<WeatherFieldValue | null>(null);

export const WeatherFieldProvider = WeatherFieldContext.Provider;

export function useWeatherField(): WeatherFieldValue {
  const v = useContext(WeatherFieldContext);
  if (!v) throw new Error("useWeatherField must be used inside <WeatherExperienceShell>");
  return v;
}
