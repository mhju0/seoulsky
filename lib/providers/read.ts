import type { DailyForecast, ProviderSnapshot, WeatherProviderStatus } from "../types.ts";
import type { WeatherProvider } from "./base.ts";

export interface AvailableProviderDaily {
  source: WeatherProvider["id"];
  daily: DailyForecast[];
}

const empty = { current: null, hourly: [], daily: [] };

function statusError(provider: WeatherProvider): WeatherProviderStatus {
  return {
    id: provider.id,
    name: provider.name,
    availability: "error",
    message: "상태 확인 중 오류가 발생했습니다",
    missingEnvVars: [],
    lastUpdated: null,
    fromCache: false,
  };
}

/**
 * Read a provider's normalized snapshot through the one seam consumers share.
 * Unavailable and failed providers remain visible through their status while
 * their data stays empty, so optional sources never interrupt a caller.
 */
export async function readProviderSnapshot(provider: WeatherProvider): Promise<ProviderSnapshot> {
  let status: WeatherProviderStatus;
  try {
    status = await provider.getProviderStatus();
  } catch {
    return { id: provider.id, status: statusError(provider), ...empty };
  }

  if (status.availability !== "ok") return { id: provider.id, status, ...empty };

  try {
    const { current, hourly, daily } = await provider.readForecast();
    return { id: provider.id, status, current, hourly, daily };
  } catch {
    return {
      id: provider.id,
      status: { ...status, availability: "error", message: "데이터 조회에 실패했습니다" },
      ...empty,
    };
  }
}

/**
 * Read one provider's daily forecast for callers that intentionally omit an
 * unavailable or failing optional source from a consensus or batch run.
 */
export async function readAvailableProviderDaily(provider: WeatherProvider): Promise<AvailableProviderDaily | null> {
  const snapshot = await readProviderSnapshot(provider);
  return snapshot.status.availability === "ok"
    ? { source: snapshot.id, daily: snapshot.daily }
    : null;
}
