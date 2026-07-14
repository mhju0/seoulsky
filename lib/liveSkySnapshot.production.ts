import "server-only";

import { getFusedAirQuality } from "./providers/air-quality";
import { kmaProvider } from "./providers/kma";
import { openMeteoProvider } from "./providers/open-meteo";
import { getSkyRadar } from "./providers/radar";
import { collectForecastSources } from "./reliability/forecastSources";
import { loadWeightsStateCached } from "./reliability/runtimeWeightsSource";
import {
  readLiveSkySnapshot,
  type LiveSkyDependencies,
  type LiveSkySnapshotOptions,
} from "./liveSkySnapshot";
import type { CurrentWeather, NormalizedWarning, SkySnapshot } from "./types";

async function getKmaCurrent(): Promise<CurrentWeather | null> {
  try {
    const status = await kmaProvider.getProviderStatus();
    return status.availability === "ok" ? await kmaProvider.getCurrentWeather() : null;
  } catch {
    return null;
  }
}

async function getWarnings(): Promise<NormalizedWarning[]> {
  try {
    return (await kmaProvider.getWarnings?.()) ?? [];
  } catch {
    return [];
  }
}

const dependencies: LiveSkyDependencies = {
  async getOpenMeteo() {
    const [current, hourly, daily, status] = await Promise.all([
      openMeteoProvider.getCurrentWeather(),
      openMeteoProvider.getHourlyForecast?.() ?? Promise.resolve([]),
      openMeteoProvider.getDailyForecast(),
      openMeteoProvider.getProviderStatus(),
    ]);
    return { current, hourly, daily, status };
  },
  getAir: getFusedAirQuality,
  getRadar: getSkyRadar,
  getKmaCurrent,
  getWarnings,
  getWeightsState: loadWeightsStateCached,
  getForecastSources: collectForecastSources,
};

const options: LiveSkySnapshotOptions = {
  now: () => new Date(),
  multiSourcePrecip: process.env.MULTI_SOURCE_PRECIP === "1",
  reliabilityDebug: process.env.RELIABILITY_DEBUG === "1",
};

export function readProductionLiveSkySnapshot(): Promise<SkySnapshot> {
  return readLiveSkySnapshot(dependencies, options);
}
