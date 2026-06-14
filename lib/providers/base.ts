import type {
  CurrentWeather,
  DailyForecast,
  HourlyForecast,
  NormalizedWarning,
  WeatherProviderStatus,
} from "../types";

/**
 * Contract every weather source must implement.
 *
 * Implementations should fetch their upstream API once per cache window
 * (see lib/cache.ts) and slice the three views from that single response.
 * Methods may throw — the API route catches failures per provider so one
 * broken source never takes down the dashboard.
 */
export interface WeatherProvider {
  readonly id: WeatherProviderStatus["id"];
  /** Korean display name */
  readonly name: string;
  getProviderStatus(): Promise<WeatherProviderStatus>;
  getCurrentWeather(): Promise<CurrentWeather>;
  getHourlyForecast(): Promise<HourlyForecast[]>;
  getDailyForecast(): Promise<DailyForecast[]>;
  /**
   * Official weather warnings (특보). Optional — only sources with an
   * authoritative warning feed implement it. Must resolve to [] (never throw)
   * when unavailable so a missing/failed feed stays invisible to the public.
   */
  getWarnings?(): Promise<NormalizedWarning[]>;
}
