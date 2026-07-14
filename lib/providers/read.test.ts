import assert from "node:assert/strict";
import test from "node:test";
import type {
  CurrentWeather,
  DailyForecast,
  HourlyForecast,
  WeatherProviderStatus,
} from "../types.ts";
import type { WeatherProvider } from "./base.ts";
import { readAvailableProviderDaily, readProviderSnapshot } from "./read.ts";

const status = (availability: WeatherProviderStatus["availability"] = "ok"): WeatherProviderStatus => ({
  id: "open-meteo",
  name: "Open-Meteo",
  availability,
  message: "test",
  missingEnvVars: [],
  lastUpdated: "2026-07-14T00:00:00.000Z",
  fromCache: false,
});

const current: CurrentWeather = {
  time: "2026-07-14T00:00:00.000Z",
  temperature: 25,
  apparentTemperature: 26,
  humidity: 60,
  windSpeed: 3,
  windDirection: 180,
  precipitation: 0,
  cloudCover: 20,
  condition: "clear",
};

const hourly: HourlyForecast[] = [
  { time: "2026-07-14T01:00:00.000Z", temperature: 24, precipitationProbability: 0, windSpeed: 2, humidity: 65, condition: "clear" },
];

const daily: DailyForecast[] = [
  { date: "2026-07-14", temperatureMax: 30, temperatureMin: 22, precipitationProbability: 10, condition: "clear", sunrise: null, sunset: null },
];

function provider(overrides: Partial<WeatherProvider> = {}): WeatherProvider {
  return {
    id: "open-meteo",
    name: "Open-Meteo",
    getProviderStatus: async () => status(),
    getCurrentWeather: async () => current,
    getHourlyForecast: async () => hourly,
    getDailyForecast: async () => daily,
    ...overrides,
  };
}

test("readProviderSnapshot returns a complete normalized snapshot from a live provider", async () => {
  const result = await readProviderSnapshot(provider());

  assert.deepEqual(result, { id: "open-meteo", status: status(), current, hourly, daily });
});

test("readProviderSnapshot exposes unavailable status with empty data and does not read views", async () => {
  let readViews = false;
  const result = await readProviderSnapshot(
    provider({
      getProviderStatus: async () => status("needs-config"),
      getCurrentWeather: async () => {
        readViews = true;
        return current;
      },
    }),
  );

  assert.equal(readViews, false);
  assert.deepEqual(result, { id: "open-meteo", status: status("needs-config"), current: null, hourly: [], daily: [] });
});

test("readAvailableProviderDaily drops unavailable and failing providers without throwing", async () => {
  assert.equal(await readAvailableProviderDaily(provider({ getProviderStatus: async () => status("error") })), null);
  assert.equal(
    await readAvailableProviderDaily(provider({ getDailyForecast: async () => Promise.reject(new Error("upstream")) })),
    null,
  );
});
