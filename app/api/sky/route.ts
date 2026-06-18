import { NextResponse } from "next/server";
import { seoulDateStr } from "@/lib/format";
import { getFusedAirQuality } from "@/lib/providers/air-quality";
import { kmaProvider } from "@/lib/providers/kma";
import { openMeteoProvider } from "@/lib/providers/open-meteo";
import { getSkyRadar } from "@/lib/providers/radar";
import { gatePrecipWeighting } from "@/lib/reliability/runtimeWeights";
import { loadWeightsStateCached } from "@/lib/reliability/runtimeWeightsSource";
import { chooseCurrent, reweightForecastPrecip } from "@/lib/skyFusion";
import type { CurrentWeather, NormalizedWarning, ProviderId, SkySnapshot } from "@/lib/types";

/**
 * Phase 3: forecast sources whose learned precip weights may refine the scene's
 * precip fields. Today the live /sky path carries a single forecast source
 * (Open-Meteo), so the weighted consensus is the identity — output is byte-for-byte
 * unchanged until both (a) weights warm up and (b) more forecast sources feed here.
 */
const PRECIP_FORECAST_SOURCES: ProviderId[] = ["open-meteo"];
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
    const [current, hourly, daily, status, air, radar, kmaCurrent, warnings, weightsState] =
      await Promise.all([
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
      ]);

    // Today's sun times in Seoul wall-time — never assume daily[0] is today.
    const today = seoulDateStr(new Date());
    const todaySun = daily.find((d) => d.date === today) ?? daily[0] ?? null;

    // Phase 3: gated, PRECIP-ONLY learned weighting. With a single live forecast
    // source this is the identity (byte-for-byte unchanged); it degrades to equal
    // whenever the gate isn't met. Non-precip fields and chooseCurrent are untouched.
    const weighting = gatePrecipWeighting(weightsState, PRECIP_FORECAST_SOURCES, new Date());
    const weightedPrecip = reweightForecastPrecip(
      { daily, hourly, currentPrecipitationProbability: current.precipitationProbability ?? null },
      "open-meteo",
      weighting.weights,
    );

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
      // Debug-only (RELIABILITY_DEBUG=1): how the precip weights were applied.
      ...(RELIABILITY_DEBUG
        ? {
            precipWeighting: {
              mode: weighting.mode,
              reason: weighting.reason,
              confidence: weighting.confidence,
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
