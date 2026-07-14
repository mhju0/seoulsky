import assert from "node:assert/strict";
import test from "node:test";
import type {
  DailySkillRecord,
  ForecastRecord,
  ObservationRecord,
  WeightsState,
} from "./types.ts";
import {
  runReliabilityCycle,
  type ReliabilityCycleStore,
} from "./cycle.ts";

class MemoryReliabilityStore implements ReliabilityCycleStore {
  forecasts: ForecastRecord[];
  skill: DailySkillRecord[] = [];
  weights: WeightsState | null = null;

  constructor(forecasts: ForecastRecord[]) {
    this.forecasts = [...forecasts];
  }

  async appendForecasts(records: readonly ForecastRecord[]) {
    this.forecasts.push(...records);
    return records.length;
  }

  async readForecasts(date: string) {
    return this.forecasts.filter((record) => record.date === date);
  }

  async appendDailySkill(records: readonly DailySkillRecord[]) {
    this.skill.push(...records);
    return records.length;
  }

  async readDailySkill() {
    return [...this.skill];
  }

  async readWeights() {
    return this.weights;
  }

  async writeWeights(state: WeightsState) {
    this.weights = state;
  }
}

const runAt = new Date("2026-07-14T00:00:00.000Z");
const priorForecasts: ForecastRecord[] = [
  {
    date: "2026-07-13",
    source: "open-meteo",
    region: "seoul",
    pop: 90,
    predicted_mm: 8,
    loggedAt: "2026-07-12T21:10:00.000Z",
  },
  {
    date: "2026-07-13",
    source: "kma",
    region: "seoul",
    pop: 10,
    predicted_mm: null,
    loggedAt: "2026-07-12T21:10:00.000Z",
  },
];

test("one reliability cycle logs tomorrow, scores yesterday, and advances learned weights", async () => {
  const store = new MemoryReliabilityStore(priorForecasts);
  const observation: ObservationRecord = {
    date: "2026-07-13",
    region: "seoul",
    observed_mm: 10,
    source: "kma-asos-observation",
    observedAt: "2026-07-14T00:00:00.000Z",
  };

  const result = await runReliabilityCycle({
    now: () => runAt,
    sourceIds: ["open-meteo", "kma"],
    store,
    collectForecasts: async (date, now) => [
      {
        date,
        source: "open-meteo",
        region: "seoul",
        pop: 40,
        predicted_mm: 2,
        loggedAt: now.toISOString(),
      },
    ],
    fetchObservation: async () => observation,
    eta: 0.5,
  });

  assert.equal(result.forecast.date, "2026-07-15");
  assert.equal(result.forecast.appended, 1);
  assert.equal(result.scoring.date, "2026-07-13");
  assert.equal(result.scoring.appended, 2);
  assert.deepEqual(
    store.skill.map(({ source, outcome }) => ({ source, outcome })),
    [
      { source: "open-meteo", outcome: "hit" },
      { source: "kma", outcome: "miss" },
    ],
  );
  assert.deepEqual(store.weights?.processedDates, ["2026-07-13"]);
  assert.equal(store.weights?.eventsScored, 2);
  assert.ok((store.weights?.weights["open-meteo"] ?? 0) > (store.weights?.weights.kma ?? 1));
  assert.equal(result.weighting.written, true);
});

test("a missing observation preserves honest omission while still logging forecasts", async () => {
  const store = new MemoryReliabilityStore(priorForecasts);
  const result = await runReliabilityCycle({
    now: () => runAt,
    sourceIds: ["open-meteo", "kma"],
    store,
    collectForecasts: async () => [],
    fetchObservation: async () => null,
  });

  assert.equal(result.scoring.observation, null);
  assert.equal(result.scoring.appended, 0);
  assert.deepEqual(store.skill, []);
  assert.equal(store.weights?.eventsScored, 0);
});

test("a successful correct-dry observation refreshes state health without moving learned weights", async () => {
  const dryForecast: ForecastRecord = {
    date: "2026-07-13",
    source: "open-meteo",
    region: "seoul",
    pop: 0,
    predicted_mm: 0,
    loggedAt: "2026-07-12T21:10:00.000Z",
  };
  const store = new MemoryReliabilityStore([dryForecast]);
  store.weights = {
    updatedAt: "2026-07-01T00:00:00.000Z",
    eventsScored: 20,
    processedDates: ["2026-07-01"],
    weights: { "open-meteo": 0.6, kma: 0.4 },
  };

  const result = await runReliabilityCycle({
    now: () => runAt,
    sourceIds: ["open-meteo", "kma"],
    store,
    collectForecasts: async () => [],
    fetchObservation: async () => ({
      date: "2026-07-13",
      region: "seoul",
      observed_mm: 0,
      source: "kma-asos-observation",
      observedAt: runAt.toISOString(),
    }),
  });

  assert.equal(result.scoring.records.length, 0, "correct-dry remains non-informative");
  assert.equal(result.weighting.written, true, "successful truth read refreshes state health");
  assert.equal(store.weights?.updatedAt, runAt.toISOString());
  assert.equal(store.weights?.eventsScored, 20);
  assert.deepEqual(store.weights?.weights, { "open-meteo": 0.6, kma: 0.4 });
});
