import assert from "node:assert/strict";
import test from "node:test";
import type { DailySkillRecord, ForecastRecord, WeightsState } from "./types.ts";
import {
  assertReliabilitySnapshotMonotonic,
  mergeReliabilitySnapshots,
  type ReliabilitySnapshot,
} from "./stateSnapshot.ts";

function forecast(date: string, source: ForecastRecord["source"]): ForecastRecord {
  return {
    date,
    source,
    region: "seoul",
    pop: 50,
    predicted_mm: 1,
    loggedAt: `${date}T00:00:00.000Z`,
  };
}

function skill(date: string, source: DailySkillRecord["source"]): DailySkillRecord {
  return {
    date,
    source,
    region: "seoul",
    pop: 50,
    predicted_mm: 1,
    observed_mm: 2,
    predicted_rain: true,
    observed_rain: true,
    outcome: "hit",
    contingency: { hits: 1, misses: 0, false_alarms: 0, correct_negatives: 0 },
    csi: 1,
    categorical_skill: 1,
    quantitative_skill: 0.95,
    mae: 1,
    skill: 0.98,
    scoredAt: `${date}T12:00:00.000Z`,
  };
}

function weights(updatedAt: string, eventsScored: number, processedDates: string[]): WeightsState {
  return {
    updatedAt,
    eventsScored,
    processedDates,
    weights: { "open-meteo": 0.6, kma: 0.4 },
  };
}

const knownGood: ReliabilitySnapshot = {
  forecasts: [forecast("2026-07-13", "open-meteo"), forecast("2026-07-14", "open-meteo")],
  dailySkill: [
    skill("2026-06-24", "open-meteo"),
    skill("2026-07-13", "open-meteo"),
    skill("2026-07-13", "kma"),
  ],
  weights: weights("2026-07-14T00:00:00.000Z", 3, ["2026-06-24", "2026-07-13"]),
};

test("monotonic guard refuses to replace durable history with fewer rows or older weights", () => {
  const regressed: ReliabilitySnapshot = {
    forecasts: knownGood.forecasts.slice(0, 1),
    dailySkill: knownGood.dailySkill.slice(0, 1),
    weights: weights("2026-06-25T00:00:00.000Z", 1, []),
  };

  assert.throws(
    () => assertReliabilitySnapshotMonotonic(knownGood, regressed),
    /forecast history.*daily-skill history.*weight state/i,
  );
});

test("monotonic guard refuses same-key history replacement outside explicit recovery", () => {
  const replaced: ReliabilitySnapshot = {
    ...knownGood,
    forecasts: knownGood.forecasts.map((record, index) =>
      index === 0 ? { ...record, pop: 99 } : record,
    ),
    dailySkill: knownGood.dailySkill.map((record, index) =>
      index === 0 ? { ...record, skill: 0.01 } : record,
    ),
  };

  assert.throws(
    () => assertReliabilitySnapshotMonotonic(knownGood, replaced),
    /forecast history replaced.*daily-skill history replaced/i,
  );
  assert.doesNotThrow(() =>
    assertReliabilitySnapshotMonotonic(knownGood, replaced, { allowContentRepair: true }),
  );
});

test("weight checkpoint rejects a different vector when no new event was scored", () => {
  const replacedWeights: ReliabilitySnapshot = {
    ...knownGood,
    weights: {
      ...knownGood.weights!,
      weights: { "open-meteo": 0.4, kma: 0.6 },
    },
  };

  assert.throws(
    () => assertReliabilitySnapshotMonotonic(knownGood, replacedWeights),
    /weight vector changed without new scored events/i,
  );
});

test("recovery merge keeps the advanced checkpoint and unions newer unique rows", () => {
  const regressedButNewerForecast: ReliabilitySnapshot = {
    forecasts: [forecast("2026-07-15", "open-meteo")],
    dailySkill: [skill("2026-06-24", "open-meteo")],
    weights: weights("2026-06-25T00:00:00.000Z", 1, ["2026-06-24"]),
  };

  const recovered = mergeReliabilitySnapshots(knownGood, regressedButNewerForecast);

  assert.deepEqual(
    recovered.forecasts.map(({ date }) => date),
    ["2026-07-13", "2026-07-14", "2026-07-15"],
  );
  assert.equal(recovered.dailySkill.length, 3);
  assert.deepEqual(recovered.weights, knownGood.weights);
  assert.doesNotThrow(() => assertReliabilitySnapshotMonotonic(regressedButNewerForecast, recovered));
});

test("explicit recovery trusts stronger evidence even when a reset wrote a newer timestamp", () => {
  const resetWithNewerTimestamp: ReliabilitySnapshot = {
    forecasts: [forecast("2026-07-15", "open-meteo")],
    dailySkill: [skill("2026-06-19", "open-meteo")],
    weights: weights("2026-07-15T00:00:00.000Z", 1, ["2026-06-19"]),
  };
  const olderButMoreCompleteCheckpoint: ReliabilitySnapshot = {
    forecasts: [forecast("2026-06-19", "open-meteo")],
    dailySkill: [
      skill("2026-06-19", "open-meteo"),
      skill("2026-07-10", "open-meteo"),
    ],
    weights: weights("2026-07-10T00:00:00.000Z", 2, ["2026-06-19", "2026-07-10"]),
  };

  const recovered = mergeReliabilitySnapshots(
    olderButMoreCompleteCheckpoint,
    resetWithNewerTimestamp,
  );

  assert.deepEqual(recovered.weights, olderButMoreCompleteCheckpoint.weights);
  assert.throws(
    () => assertReliabilitySnapshotMonotonic(resetWithNewerTimestamp, recovered),
    /timestamp moved backward/i,
  );
  assert.doesNotThrow(() =>
    assertReliabilitySnapshotMonotonic(resetWithNewerTimestamp, recovered, {
      allowContentRepair: true,
    }),
  );
});

test("explicit recovery repair still refuses to lose learned events or processed dates", () => {
  const regressed: ReliabilitySnapshot = {
    ...knownGood,
    weights: weights("2026-07-15T00:00:00.000Z", 1, ["2026-07-13"]),
  };

  assert.throws(
    () =>
      assertReliabilitySnapshotMonotonic(knownGood, regressed, {
        allowContentRepair: true,
      }),
    /eventsScored moved backward.*lost 1 processed date/i,
  );
});
