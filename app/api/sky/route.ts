import { NextResponse } from "next/server";
import { seoulDateStr } from "@/lib/format";
import { getFusedAirQuality } from "@/lib/providers/air-quality";
import { kmaProvider } from "@/lib/providers/kma";
import { openMeteoProvider } from "@/lib/providers/open-meteo";
import { getSkyRadar } from "@/lib/providers/radar";
import { collectForecastSources } from "@/lib/reliability/forecastSources";
import { gatePrecipWeighting } from "@/lib/reliability/runtimeWeights";
import { loadWeightsStateCached } from "@/lib/reliability/runtimeWeightsSource";
import {
  chooseCurrent,
  fuseMultiSourceDaily,
  reweightForecastPrecip,
  type SourceDailyForecast,
} from "@/lib/skyFusion";
import type { CurrentWeather, NormalizedWarning, ProviderId, SkySnapshot } from "@/lib/types";

/**
 * Phase 3: the single forecast source the live /sky path has always carried. With
 * one source the weighted consensus is the identity. Used for the flag-OFF path and
 * the all-sources-down fallback (byte-for-byte pre-Phase-4 behavior).
 */
const PRECIP_FORECAST_SOURCES: ProviderId[] = ["open-meteo"];
/**
 * Phase 4 flag (env, default OFF). OFF ⇒ the exact Open-Meteo-only precip path,
 * unchanged. ON ⇒ multi-source weighted consensus for daily POP / predicted_mm.
 * This is the FIRST phase that intentionally changes runtime output, so flipping it
 * ON shifts the precip baseline to an equal-weighted consensus even before the
 * learned weights engage.
 */
const MULTI_SOURCE_PRECIP = process.env.MULTI_SOURCE_PRECIP === "1";
/** Debug-only: expose the precip weighting decision in the payload. Never on in prod. */
const RELIABILITY_DEBUG = process.env.RELIABILITY_DEBUG === "1";

/**
 * GET /api/sky — the public cinematic page's data source.
 *
 * Open-Meteo weather (free, keyless) is the baseline, fused per documented rules:
 *  • temperature / active precip / condition — KMA observation when configured
 *    (see lib/skyFusion.ts), else Open-Meteo
 *  • cloud / visibility / wind / is-day / sun — always Open-Meteo
 *  • air quality — AirKorea → Open-Meteo AQ → null
 *  • radar — RainViewer approach signal (optional)
 *  • warnings — KMA only, when configured
 *
 * No env-var gating: the scene works with zero keys (KMA/air/radar all degrade to
 * null/[] without ever failing the route). /api/weather still powers /diagnostics.
 */

export const dynamic = "force-dynamic";

/** KMA current observation, only when a key is configured and the fetch succeeds. */
async function kmaCurrentOrNull(): Promise<CurrentWeather | null> {
  try {
    const st = await kmaProvider.getProviderStatus();
    if (st.availability !== "ok") return null;
    return await kmaProvider.getCurrentWeather();
  } catch {
    return null;
  }
}

async function kmaWarningsOrEmpty(): Promise<NormalizedWarning[]> {
  try {
    return (await kmaProvider.getWarnings?.()) ?? [];
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const [
      current,
      hourly,
      daily,
      status,
      air,
      radar,
      kmaCurrent,
      warnings,
      weightsState,
      forecastSources,
    ] = await Promise.all([
      openMeteoProvider.getCurrentWeather(),
      // Already part of the same cached Open-Meteo snapshot — no extra upstream call.
      openMeteoProvider.getHourlyForecast?.() ?? Promise.resolve([]),
      openMeteoProvider.getDailyForecast(),
      openMeteoProvider.getProviderStatus(),
      getFusedAirQuality(),
      getSkyRadar(),
      kmaCurrentOrNull(),
      kmaWarningsOrEmpty(),
      // Learned precip weights (memoized; never throws). null ⇒ equal-fallback.
      loadWeightsStateCached(),
      // Phase 4: multi-source forecasts (TTL-cached, returned-only, never throws).
      // Only fetched when the flag is on; [] otherwise (no extra upstream work).
      MULTI_SOURCE_PRECIP ? collectForecastSources() : Promise.resolve<SourceDailyForecast[]>([]),
    ]);

    // Today's sun times in Seoul wall-time — never assume daily[0] is today.
    const today = seoulDateStr(new Date());
    const todaySun = daily.find((d) => d.date === today) ?? daily[0] ?? null;

    // PRECIP-ONLY learned weighting (Phase 3 gate + Phase 4 multi-source consensus).
    // Non-precip fields and chooseCurrent are untouched.
    //
    // Flag OFF (default), or ON but every forecast source down this cycle: the exact
    // Phase 3 single-source path — gate over the one live source (Open-Meteo), so the
    // reweight is the identity and the output is byte-for-byte pre-Phase-4.
    //
    // Flag ON with ≥1 forecast source returned: the daily POP / predicted_mm become a
    // weighted consensus over whoever returned (weights gated + renormalized over the
    // available subset). Hourly + current POP stay single-source (the learned weights
    // rank DAILY forecast skill; providers' hourly grids don't align) — identity, so
    // those fields are unchanged. predicted_mm self-restricts to amount-bearing sources.
    const multiSource = MULTI_SOURCE_PRECIP && forecastSources.length > 0;
    const weightSources = multiSource ? forecastSources.map((s) => s.source) : PRECIP_FORECAST_SOURCES;
    const weighting = gatePrecipWeighting(weightsState, weightSources, new Date());
    const single = reweightForecastPrecip(
      { daily, hourly, currentPrecipitationProbability: current.precipitationProbability ?? null },
      "open-meteo",
      weighting.weights,
    );
    const weightedPrecip = multiSource
      ? { ...single, daily: fuseMultiSourceDaily(daily, forecastSources, weighting.weights) }
      : single;

    // Deterministic fusion: KMA observation preferred for temp/active-precip.
    const choice = chooseCurrent(
      {
        temperature: current.temperature,
        condition: current.condition,
        precipitation: current.precipitation ?? 0,
      },
      kmaCurrent,
    );

    const sources: ProviderId[] = ["open-meteo"];
    if (kmaCurrent) sources.push("kma");
    if (air) sources.push(air.source);
    if (radar) sources.push("rainviewer");

    const payload: SkySnapshot = {
      observedAt: kmaCurrent?.time ?? current.time,
      fetchedAt: new Date().toISOString(),
      fromCache: status.fromCache,
      stale: status.stale ?? false,
      current: {
        temperature: choice.temperature,
        apparentTemperature: current.apparentTemperature,
        humidity: current.humidity,
        windSpeed: current.windSpeed,
        windGusts: current.windGusts ?? null,
        windDirection: current.windDirection,
        precipitation: choice.precipitation,
        rain: current.rain ?? null,
        snowfall: current.snowfall ?? null,
        precipitationProbability: weightedPrecip.currentPrecipitationProbability,
        cloudCover: current.cloudCover,
        visibility: current.visibility ?? null,
        isDay: current.isDay ?? null,
        weatherCode: current.weatherCode ?? null,
        condition: choice.condition,
      },
      sun: {
        sunrise: todaySun?.sunrise ?? null,
        sunset: todaySun?.sunset ?? null,
      },
      hourly: weightedPrecip.hourly,
      daily: weightedPrecip.daily,
      air,
      radar,
      warnings,
      observationSource: choice.temperatureSource,
      sources,
      // Debug-only (RELIABILITY_DEBUG=1): how the precip weights were applied,
      // plus which sources contributed this cycle and their effective (post-
      // availability-renormalization) weights. Absent in prod / when the flag is off.
      ...(RELIABILITY_DEBUG
        ? {
            precipWeighting: {
              mode: weighting.mode,
              reason: weighting.reason,
              confidence: weighting.confidence,
              multiSource,
              sources: weightSources,
              weights: weighting.weights,
            },
          }
        : {}),
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // The client keeps the last good snapshot and shows a safe fallback.
    return NextResponse.json({ error: "sky_unavailable" }, { status: 503 });
  }
}
