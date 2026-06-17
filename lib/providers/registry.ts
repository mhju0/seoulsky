import type { ProviderSnapshot } from "../types";
import type { WeatherProvider } from "./base";
import { kmaProvider } from "./kma";
import { metNorwayProvider } from "./met-norway";
import { openMeteoProvider } from "./open-meteo";
import { pirateWeatherProvider } from "./pirate-weather";
import { weatherApiProvider } from "./weather-api";

/**
 * Order matters: the first live provider becomes the primary source that
 * drives the diagnostics hero. Open-Meteo first — free, keyless, reliable;
 * MET Norway second (keyless); KMA, Pirate Weather, WeatherAPI when keys
 * are configured.
 */
export const providers: WeatherProvider[] = [
  openMeteoProvider,
  metNorwayProvider,
  kmaProvider,
  pirateWeatherProvider,
  weatherApiProvider,
];

/**
 * Collect one provider's full state without ever throwing.
 * Data fetch happens once inside getProviderStatus() (shared TTL cache),
 * so the three getters afterwards are cache hits.
 */
export async function snapshotProvider(provider: WeatherProvider): Promise<ProviderSnapshot> {
  const empty = { current: null, hourly: [], daily: [] };
  let status;
  try {
    status = await provider.getProviderStatus();
  } catch {
    return {
      id: provider.id,
      status: {
        id: provider.id,
        name: provider.name,
        availability: "error",
        message: "상태 확인 중 오류가 발생했습니다",
        missingEnvVars: [],
        lastUpdated: null,
        fromCache: false,
      },
      ...empty,
    };
  }
  if (status.availability !== "ok") {
    return { id: provider.id, status, ...empty };
  }
  try {
    const [current, hourly, daily] = await Promise.all([
      provider.getCurrentWeather(),
      provider.getHourlyForecast(),
      provider.getDailyForecast(),
    ]);
    return { id: provider.id, status, current, hourly, daily };
  } catch {
    return {
      id: provider.id,
      status: { ...status, availability: "error", message: "데이터 조회에 실패했습니다" },
      ...empty,
    };
  }
}
