import assert from "node:assert/strict";
import test from "node:test";
import type {
  CurrentWeather,
  DailyForecast,
  HourlyForecast,
  ProviderId,
  ProviderSnapshot,
  WeatherProviderStatus,
} from "./types.ts";
import {
  readWeatherIntelligence,
  type WeatherIntelligenceDependencies,
} from "./weatherIntelligence.ts";

const generatedAt = new Date("2026-07-14T07:02:05.000Z");

const current: CurrentWeather = {
  time: "2026-07-14T16:00:00+09:00",
  temperature: 30,
  apparentTemperature: 36,
  humidity: 70,
  windSpeed: 8,
  windDirection: 180,
  precipitation: 0,
  cloudCover: 80,
  condition: "rain",
};

const hourly: HourlyForecast[] = [
  {
    time: "2026-07-14T17:00:00+09:00",
    temperature: 29,
    precipitationProbability: 80,
    windSpeed: 7,
    humidity: 72,
    condition: "rain",
  },
];

const daily: DailyForecast[] = [
  {
    date: "2026-07-14",
    temperatureMax: 32,
    temperatureMin: 25,
    precipitationProbability: 90,
    condition: "rain",
    sunrise: null,
    sunset: null,
  },
];

function status(id: ProviderId, availability: WeatherProviderStatus["availability"] = "ok"): WeatherProviderStatus {
  return {
    id,
    name: id,
    availability,
    message: "test",
    missingEnvVars: [],
    lastUpdated: current.time,
    fromCache: false,
  };
}

function snapshot(id: ProviderId, availability: WeatherProviderStatus["availability"] = "ok"): ProviderSnapshot {
  return availability === "ok"
    ? { id, status: status(id), current, hourly, daily }
    : { id, status: status(id, availability), current: null, hourly: [], daily: [] };
}

function dependencies(overrides: Partial<WeatherIntelligenceDependencies> = {}): WeatherIntelligenceDependencies {
  return {
    providerReads: [],
    getEnvironment: async () => ({ statuses: [], air: null, radar: null }),
    getWarnings: async () => [],
    ...overrides,
  };
}

test("readWeatherIntelligence assembles a deterministic empty-source payload", async () => {
  const result = await readWeatherIntelligence(dependencies(), { now: () => generatedAt });

  assert.equal(result.generatedAt, "2026-07-14T07:02:05.000Z");
  assert.deepEqual(result.providers, []);
  assert.equal(result.primaryId, null);
  assert.equal(result.comparison, null);
  assert.equal(result.confidence.level, "single-source");
  assert.deepEqual(result.environment, { statuses: [], air: null, radar: null });
  assert.deepEqual(result.warnings, []);
});

test("readWeatherIntelligence reports one live provider without inventing a comparison", async () => {
  const openMeteo = snapshot("open-meteo");
  const result = await readWeatherIntelligence(
    dependencies({ providerReads: [async () => openMeteo] }),
    { now: () => generatedAt },
  );

  assert.deepEqual(result.providers, [openMeteo]);
  assert.equal(result.primaryId, "open-meteo");
  assert.equal(result.comparison, null);
  assert.equal(result.confidence.level, "single-source");
});

test("readWeatherIntelligence keeps registry order and makes the first live provider primary", async () => {
  const ordered = [snapshot("open-meteo"), snapshot("met-norway"), snapshot("kma")];
  const result = await readWeatherIntelligence(
    dependencies({ providerReads: ordered.map((provider) => async () => provider) }),
    { now: () => generatedAt },
  );

  assert.deepEqual(result.providers.map((provider) => provider.id), ["open-meteo", "met-norway", "kma"]);
  assert.equal(result.primaryId, "open-meteo");
  assert.deepEqual(result.comparison?.providersCompared, ["open-meteo", "met-norway", "kma"]);
});

test("readWeatherIntelligence degrades optional provider, environment, and warning failures independently", async () => {
  const live = snapshot("open-meteo");
  const unavailable = snapshot("weather-api", "needs-config");
  const result = await readWeatherIntelligence(
    dependencies({
      providerReads: [
        async () => live,
        async () => unavailable,
        async () => Promise.reject(new Error("optional provider failed outside its adapter")),
      ],
      getEnvironment: async () => Promise.reject(new Error("optional environment failed")),
      getWarnings: async () => Promise.reject(new Error("optional warning feed failed")),
    }),
    { now: () => generatedAt },
  );

  assert.deepEqual(result.providers.map((provider) => provider.id), ["open-meteo", "weather-api"]);
  assert.equal(result.primaryId, "open-meteo");
  assert.deepEqual(result.environment, { statuses: [], air: null, radar: null });
  assert.deepEqual(result.warnings, []);
});
