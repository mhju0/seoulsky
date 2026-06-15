/**
 * Deterministic cinematic-plate selection from live Seoul conditions.
 *
 * Given the current observed weather + today's sun geometry, this picks ONE
 * {@link CinematicPlateKey} representing the broad category, plus a short reason
 * and the continuous sun phase (for diagnostics / the live three.js layer). The
 * footage only ever stands in for the *category*; the real-time scene layered on
 * top is what makes it match the exact current rain/wind/visibility.
 *
 * Priority ladder (first match wins) — observed conditions, never mere
 * probability, so a 30% chance of rain does NOT summon a storm:
 *   1. thunderstorm                         → storm
 *   2. snow (condition or live snowfall)     → snow
 *   3. rain (rainy condition / heavy warning)→ rain
 *   4. fog or very low visibility            → fog
 *   5. heavy cloud cover                     → cloudy (day) | overcast-night
 *   6. pre-dawn / sunrise                     → dawn
 *   7. golden-hour / sunset / blue-hour       → sunset
 *   8. clear/partly-cloudy at night           → clear-night
 *   9. default daylight                       → clear-day
 *
 * Pure: no three.js, no React, no I/O. Tested in selectPlate.test.ts.
 */

import { computeSunPhase, type SunPhaseName } from "./seoulTime.ts";
import type { CinematicPlateKey } from "./plateManifest.ts";
import type { WeatherCondition } from "../types.ts";

/** Lean input — the exact fields selection needs (easy to construct in tests). */
export interface PlateSelectionInput {
  condition: WeatherCondition;
  /** 0–100, or null when unknown. */
  cloudCover: number | null;
  /** mm in the current observation window. */
  precipitation: number | null;
  /** cm/mm of snow in the current window (any positive value ⇒ snowing). */
  snowfall: number | null;
  /** metres; very low ⇒ fog. */
  visibility: number | null;
  /** Open-Meteo is_day hint (tie-breaker near the horizon). */
  isDay: boolean | null;
  /** Today's sunrise/sunset, ISO with offset (KST). */
  sunrise: string | null;
  sunset: string | null;
  /** Active official warnings — only hazard `type` is consulted. */
  warnings?: { type: string }[];
  /** Override "now" (tests / dev). Defaults to the real instant. */
  now?: Date;
}

export interface PlateSelection {
  key: CinematicPlateKey;
  /** Short machine-ish English reason, surfaced in /diagnostics. */
  reason: string;
  /** Continuous sun phase at selection time. */
  phase: SunPhaseName;
  /** Sun above the horizon. */
  isDay: boolean;
}

/** Conditions that read as "wet" — routed to the rain plate. */
const RAINY: WeatherCondition[] = ["drizzle", "rain", "heavy-rain", "sleet"];

/** Visibility below this (metres) reads as fog regardless of the coded condition. */
const FOG_VISIBILITY_M = 1200;
/** Cloud cover at/above this (%) reads as heavily overcast. */
const HEAVY_CLOUD_PCT = 70;

const hasWarning = (warnings: { type: string }[] | undefined, ...needles: string[]) =>
  !!warnings?.some((w) => needles.some((n) => w.type.includes(n)));

/**
 * The single selection rule. Deterministic and side-effect free.
 */
export function selectCinematicPlate(input: PlateSelectionInput): PlateSelection {
  const sun = computeSunPhase({
    now: input.now ?? new Date(),
    sunrise: input.sunrise,
    sunset: input.sunset,
    isDayHint: input.isDay,
  });
  const phase = sun.phase;
  const isDay = sun.isDay;
  const cloud = input.cloudCover ?? 0;
  const snow = input.snowfall ?? 0;
  const vis = input.visibility;
  const result = (key: CinematicPlateKey, reason: string): PlateSelection => ({
    key,
    reason,
    phase,
    isDay,
  });

  // 1. Active thunderstorm — the only path to the dramatic storm plate.
  if (input.condition === "thunderstorm") return result("storm", "thunderstorm observed");

  // 2. Snow — coded snow, any live snowfall, or a heavy-snow (대설) warning.
  if (input.condition === "snow") return result("snow", "snow condition observed");
  if (snow > 0) return result("snow", "live snowfall observed");
  if (hasWarning(input.warnings, "대설")) return result("snow", "heavy-snow warning active");

  // 3. Rain — any wet condition, or a heavy-rain (호우) / typhoon (태풍) warning.
  if (RAINY.includes(input.condition)) return result("rain", `${input.condition} observed`);
  if (hasWarning(input.warnings, "호우", "태풍")) return result("rain", "rain/typhoon warning active");

  // 4. Fog / very low visibility.
  if (input.condition === "fog") return result("fog", "fog condition observed");
  if (vis != null && vis < FOG_VISIBILITY_M) return result("fog", `very low visibility (${vis} m)`);

  // 5. Heavy cloud cover → time-aware overcast.
  const heavyCloud =
    input.condition === "overcast" ||
    input.condition === "cloudy" ||
    cloud >= HEAVY_CLOUD_PCT ||
    (input.condition === "unknown" && cloud >= 60);
  if (heavyCloud) {
    return isDay
      ? result("cloudy", "heavy cloud cover (day)")
      : result("overcast-night", "heavy cloud cover (night)");
  }

  // 6–9. Clear / partly-cloudy: pick by time of day.
  if (phase === "pre-dawn" || phase === "sunrise") return result("dawn", "pre-dawn / sunrise phase");
  if (phase === "golden-hour" || phase === "sunset" || phase === "blue-hour")
    return result("sunset", "golden-hour / sunset phase");
  if (!isDay) return result("clear-night", "clear night");
  return result("clear-day", "clear day");
}

/**
 * Convenience adapter for the lean `/api/sky` snapshot shape used on the home
 * page. Kept structural (not importing SkySnapshot) so the selector core stays
 * trivially testable and free of the heavy type graph.
 */
export function selectPlateFromSky(
  snapshot: {
    current: {
      condition: WeatherCondition;
      cloudCover: number | null;
      precipitation: number | null;
      snowfall: number | null;
      visibility: number | null;
      isDay: boolean | null;
    };
    sun: { sunrise: string | null; sunset: string | null };
    warnings?: { type: string }[];
  } | null,
  now?: Date,
): PlateSelection {
  if (!snapshot) {
    // No data yet: fall back to a pure time-of-day read with safe defaults.
    return selectCinematicPlate({
      condition: "clear",
      cloudCover: null,
      precipitation: null,
      snowfall: null,
      visibility: null,
      isDay: null,
      sunrise: null,
      sunset: null,
      now,
    });
  }
  return selectCinematicPlate({
    condition: snapshot.current.condition,
    cloudCover: snapshot.current.cloudCover,
    precipitation: snapshot.current.precipitation,
    snowfall: snapshot.current.snowfall,
    visibility: snapshot.current.visibility,
    isDay: snapshot.current.isDay,
    sunrise: snapshot.sun.sunrise,
    sunset: snapshot.sun.sunset,
    warnings: snapshot.warnings,
    now,
  });
}
