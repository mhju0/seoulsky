import type { CurrentWeather, ProviderId, WeatherCondition } from "./types";

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
