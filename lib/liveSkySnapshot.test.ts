import assert from "node:assert/strict";
import test from "node:test";
import { readLiveSkySnapshot, type LiveSkyDependencies } from "./liveSkySnapshot.ts";

const current = {
  time: "2026-07-14T06:00:00+09:00",
  temperature: 28,
  apparentTemperature: 30,
  humidity: 65,
  windSpeed: 9,
  windDirection: 180,
  precipitation: 0,
  cloudCover: 30,
  condition: "partly-cloudy" as const,
  precipitationProbability: 10,
};

const dependencies: LiveSkyDependencies = {
  getOpenMeteo: async () => ({
    current,
    hourly: [],
    daily: [
      {
        date: "2026-07-14",
        temperatureMax: 31,
        temperatureMin: 24,
        precipitationProbability: 20,
        condition: "partly-cloudy",
        sunrise: "2026-07-14T05:20:00+09:00",
        sunset: "2026-07-14T19:49:00+09:00",
      },
    ],
    status: {
      id: "open-meteo",
      name: "Open-Meteo",
      availability: "ok",
      message: "live",
      missingEnvVars: [],
      lastUpdated: current.time,
      fromCache: false,
    },
  }),
  getAir: async () => null,
  getRadar: async () => null,
  getKmaCurrent: async () => null,
  getWarnings: async () => [],
  getWeightsState: async () => null,
  getForecastSources: async () => [],
};

test("readLiveSkySnapshot assembles the stable public payload with injected time", async () => {
  const snapshot = await readLiveSkySnapshot(dependencies, {
    now: () => new Date("2026-07-14T00:15:00.000Z"),
    multiSourcePrecip: false,
    reliabilityDebug: false,
  });

  assert.equal(snapshot.fetchedAt, "2026-07-14T00:15:00.000Z");
  assert.equal(snapshot.observedAt, current.time);
  assert.equal(snapshot.current.temperature, 28);
  assert.equal(snapshot.sun.sunrise, "2026-07-14T05:20:00+09:00");
  assert.deepEqual(snapshot.sources, ["open-meteo"]);
  assert.deepEqual(snapshot.precipLearning, {
    enabled: false,
    multiSource: false,
    mode: "equal-fallback",
    reason: "disabled",
    confidence: 0,
    eventsScored: 0,
    datesScored: 0,
    updatedAt: null,
    sources: ["open-meteo"],
    effectiveWeights: { "open-meteo": 1 },
    learnedWeights: {},
  });
  assert.equal("precipWeighting" in snapshot, false);
});

test("readLiveSkySnapshot keeps the multi-source and debug flag paths", async () => {
  let forecastSourceReads = 0;
  const snapshot = await readLiveSkySnapshot(
    {
      ...dependencies,
      async getForecastSources() {
        forecastSourceReads += 1;
        return [
          {
            source: "open-meteo",
            daily: [{ date: "2026-07-14", temperatureMax: 31, temperatureMin: 24, precipitationProbability: 20, condition: "partly-cloudy", sunrise: null, sunset: null }],
          },
          {
            source: "kma",
            daily: [{ date: "2026-07-14", temperatureMax: 30, temperatureMin: 23, precipitationProbability: 80, condition: "rain", sunrise: null, sunset: null }],
          },
        ];
      },
    },
    { now: () => new Date("2026-07-14T00:15:00.000Z"), multiSourcePrecip: true, reliabilityDebug: true },
  );

  assert.equal(forecastSourceReads, 1);
  assert.equal(snapshot.daily[0].precipitationProbability, 50);
  assert.deepEqual(snapshot.precipWeighting?.sources, ["open-meteo", "kma"]);
  assert.equal(snapshot.precipWeighting?.multiSource, true);
});

test("readLiveSkySnapshot publicly explains learned precipitation weighting without debug mode", async () => {
  const snapshot = await readLiveSkySnapshot(
    {
      ...dependencies,
      async getWeightsState() {
        return {
          updatedAt: "2026-07-13T22:00:00.000Z",
          eventsScored: 15,
          processedDates: ["2026-06-19", "2026-06-20", "2026-06-22", "2026-06-25"],
          weights: { "open-meteo": 0.2, kma: 0.8 },
        };
      },
      async getForecastSources() {
        return [
          {
            source: "open-meteo",
            daily: [{ date: "2026-07-14", temperatureMax: 31, temperatureMin: 24, precipitationProbability: 20, condition: "partly-cloudy", sunrise: null, sunset: null }],
          },
          {
            source: "kma",
            daily: [{ date: "2026-07-14", temperatureMax: 30, temperatureMin: 23, precipitationProbability: 80, condition: "rain", sunrise: null, sunset: null }],
          },
        ];
      },
    },
    { now: () => new Date("2026-07-14T00:15:00.000Z"), multiSourcePrecip: true, reliabilityDebug: false },
  );

  assert.equal("precipWeighting" in snapshot, false);
  assert.equal(snapshot.precipLearning.enabled, true);
  assert.equal(snapshot.precipLearning.multiSource, true);
  assert.equal(snapshot.precipLearning.mode, "ramping");
  assert.equal(snapshot.precipLearning.reason, "ramping");
  assert.ok(Math.abs(snapshot.precipLearning.confidence - 2 / 3) < 1e-12);
  assert.equal(snapshot.precipLearning.eventsScored, 15);
  assert.equal(snapshot.precipLearning.datesScored, 4);
  assert.equal(snapshot.precipLearning.updatedAt, "2026-07-13T22:00:00.000Z");
  assert.deepEqual(snapshot.precipLearning.sources, ["open-meteo", "kma"]);
  assert.deepEqual(snapshot.precipLearning.learnedWeights, { "open-meteo": 0.2, kma: 0.8 });
  assert.ok(Math.abs(snapshot.precipLearning.effectiveWeights["open-meteo"] - 0.3) < 1e-12);
  assert.ok(Math.abs(snapshot.precipLearning.effectiveWeights.kma - 0.7) < 1e-12);
});

test("the public learning summary identifies a one-provider runtime as a single-source fallback", async () => {
  const snapshot = await readLiveSkySnapshot(
    {
      ...dependencies,
      async getWeightsState() {
        return {
          updatedAt: "2026-07-13T22:00:00.000Z",
          eventsScored: 30,
          processedDates: ["2026-06-19"],
          weights: { "open-meteo": 0.4, kma: 0.6 },
        };
      },
      async getForecastSources() {
        return [{ source: "open-meteo", daily: [] }];
      },
    },
    { now: () => new Date("2026-07-14T00:15:00.000Z"), multiSourcePrecip: true, reliabilityDebug: false },
  );

  assert.equal(snapshot.precipLearning.enabled, true);
  assert.equal(snapshot.precipLearning.multiSource, false);
  assert.deepEqual(snapshot.precipLearning.sources, ["open-meteo"]);
  assert.deepEqual(snapshot.precipLearning.effectiveWeights, { "open-meteo": 1 });
});

test("the emergency multi-source opt-out bypasses remote reliability reads", async () => {
  let weightReads = 0;
  let forecastSourceReads = 0;
  await readLiveSkySnapshot(
    {
      ...dependencies,
      async getWeightsState() {
        weightReads += 1;
        return null;
      },
      async getForecastSources() {
        forecastSourceReads += 1;
        return [];
      },
    },
    { now: () => new Date("2026-07-14T00:15:00.000Z"), multiSourcePrecip: false, reliabilityDebug: false },
  );

  assert.equal(weightReads, 0);
  assert.equal(forecastSourceReads, 0);
});
