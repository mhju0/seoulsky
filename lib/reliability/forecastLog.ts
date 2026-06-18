import { providers } from "../providers/registry.ts";
import { REGION } from "./constants.ts";
import type { ForecastRecord } from "./types.ts";

/**
 * Capture each live forecast source's daily precipitation prediction for a target
 * date, straight from the existing 5-source weather pipeline (no new providers,
 * no parallel upstream calls — the providers' own cached fetch is reused).
 *
 * Honest-by-omission: a source that is not configured, is failing, or has no
 * entry for the target day is simply skipped (never fabricated). pop comes from
 * the normalized DailyForecast; predicted_mm from the optional precipitationAmount
 * (only Open-Meteo and WeatherAPI expose a clean daily total today — see README).
 *
 * Note: KMA's *forecast* may appear here as a source. KMA's *observation* is the
 * independent ground truth fetched in groundTruth.ts and is never logged here.
 */
export async function collectForecasts(
  targetDate: string,
  now: Date = new Date(),
): Promise<ForecastRecord[]> {
  const loggedAt = now.toISOString();
  const records: ForecastRecord[] = [];

  for (const provider of providers) {
    try {
      const status = await provider.getProviderStatus();
      if (status.availability !== "ok") continue; // not configured / failing → skip

      const daily = await provider.getDailyForecast();
      const entry = daily.find((d) => d.date === targetDate);
      if (!entry) continue; // target day not in this source's horizon → skip

      records.push({
        date: targetDate,
        source: provider.id,
        region: REGION,
        pop: entry.precipitationProbability,
        predicted_mm: entry.precipitationAmount ?? null,
        loggedAt,
      });
    } catch {
      continue; // one source failing never blocks the others
    }
  }

  return records;
}
