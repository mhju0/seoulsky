import type {
  CurrentWeather,
  DailyForecast,
  HourlyForecast,
  ProviderId,
  WeatherCondition,
} from "./types";

/**
 * Deterministic current-conditions fusion for the public scene. Documented,
 * purpose-based precedence (not blind averaging) — unit-tested in
 * skyFusion.test.ts.
 *
 * Rules:
 *  • temperature  — fresh KMA observation when configured, else Open-Meteo
 *  • precipitation — KMA observation (authoritative for "is it raining now"),
 *                    else Open-Meteo
 *  • condition    — KMA when it reports ACTIVE precipitation (ground truth);
 *                   otherwise Open-Meteo, whose cloud-derived reading is richer
 *                   (KMA 초단기실황 has no sky/cloud category)
 *
 * Cloud cover, visibility, wind, is-day and the sky parameters always come from
 * Open-Meteo (the cinematic-sky primary); they are merged by the caller.
 */

const PRECIP_CONDITIONS: WeatherCondition[] = ["rain", "heavy-rain", "snow", "sleet", "drizzle"];

export function isPrecip(c: WeatherCondition): boolean {
  return PRECIP_CONDITIONS.includes(c);
}

export interface CurrentChoice {
  temperature: number;
  condition: WeatherCondition;
  precipitation: number;
  temperatureSource: ProviderId;
  conditionSource: ProviderId;
}

export function chooseCurrent(
  om: { temperature: number; condition: WeatherCondition; precipitation: number },
  kma: CurrentWeather | null,
): CurrentChoice {
  if (!kma) {
    return {
      temperature: om.temperature,
      condition: om.condition,
      precipitation: om.precipitation,
      temperatureSource: "open-meteo",
      conditionSource: "open-meteo",
    };
  }
  const kmaPrecip = isPrecip(kma.condition);
  return {
    temperature: kma.temperature,
    // KMA confirms active precip → trust it; otherwise keep Open-Meteo's cloud read.
    condition: kmaPrecip ? kma.condition : om.condition,
    precipitation: kma.precipitation ?? om.precipitation,
    temperatureSource: "kma",
    conditionSource: kmaPrecip ? "kma" : "open-meteo",
  };
}

// ── Phase 3: gated, PRECIP-ONLY learned-weight fusion ────────────────────────
// The functions below weight ONLY precipitation forecast fields (POP /
// predicted_mm). Temperature and every non-precip field are fused exactly as
// before. chooseCurrent (above) — the observation-based CURRENT conditions — is
// intentionally NOT weighted: the learned weights rank FORECAST skill, not the
// KMA observation, which is ground truth.

export interface PrecipContribution {
  source: ProviderId;
  pop: number | null;
  predicted_mm: number | null;
}

export interface FusedPrecip {
  pop: number | null;
  predicted_mm: number | null;
}

function weightedField(
  contributions: readonly PrecipContribution[],
  weights: Record<string, number>,
  select: (c: PrecipContribution) => number | null,
): number | null {
  let num = 0;
  let den = 0;
  for (const c of contributions) {
    const v = select(c);
    if (v === null) continue;
    const w = weights[c.source] ?? 0;
    if (w <= 0) continue;
    num += w * v;
    den += w;
  }
  return den > 0 ? num / den : null;
}

/**
 * Weighted precipitation consensus across forecast sources. Self-normalizes over
 * whichever sources actually contributed (a null field is skipped). A single
 * contributing source returns that source's value unchanged (the identity) — the
 * live /sky path supplies one forecast source, so this is byte-for-byte safe.
 */
export function fuseWeightedPrecip(
  contributions: readonly PrecipContribution[],
  weights: Record<string, number>,
): FusedPrecip {
  return {
    pop: weightedField(contributions, weights, (c) => c.pop),
    predicted_mm: weightedField(contributions, weights, (c) => c.predicted_mm),
  };
}

/**
 * Apply precip weights to the forecast POP / predicted_mm fields ONLY, leaving
 * every non-precip field (temperature, condition, wind, sun, …) untouched.
 * `source` is the single forecast source the live scene carries today
 * (Open-Meteo), so with one source this is the identity — i.e. byte-for-byte
 * unchanged vs pre-Phase-3. It begins to blend only once multiple forecast
 * sources are supplied as contributions.
 */
export function reweightForecastPrecip(
  input: {
    daily: DailyForecast[];
    hourly: HourlyForecast[];
    currentPrecipitationProbability: number | null;
  },
  source: ProviderId,
  weights: Record<string, number>,
): { daily: DailyForecast[]; hourly: HourlyForecast[]; currentPrecipitationProbability: number | null } {
  const daily = input.daily.map((d) => {
    const f = fuseWeightedPrecip(
      [{ source, pop: d.precipitationProbability, predicted_mm: d.precipitationAmount ?? null }],
      weights,
    );
    const out: DailyForecast = { ...d, precipitationProbability: f.pop };
    // Only rewrite predicted_mm when the source actually carried one — never add a
    // null amount where the field was absent (that would change the payload shape).
    if (d.precipitationAmount !== undefined) out.precipitationAmount = f.predicted_mm;
    return out;
  });
  const hourly = input.hourly.map((h) => {
    const f = fuseWeightedPrecip([{ source, pop: h.precipitationProbability, predicted_mm: null }], weights);
    return { ...h, precipitationProbability: f.pop };
  });
  const currentPrecipitationProbability = fuseWeightedPrecip(
    [{ source, pop: input.currentPrecipitationProbability, predicted_mm: null }],
    weights,
  ).pop;
  return { daily, hourly, currentPrecipitationProbability };
}
