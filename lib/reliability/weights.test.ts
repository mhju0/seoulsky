import { test } from "node:test";
import assert from "node:assert/strict";
import type { ProviderId } from "../types.ts";
import type { DailySkillRecord, RainOutcome, WeightsMap } from "./types.ts";
import {
  applyDayLosses,
  applyUnprocessed,
  coldStartWeights,
  DEFAULT_ETA,
  FALSE_ALARM_LOSS,
  HIT_BASE_LOSS,
  HIT_MAE_WEIGHT,
  initialWeightsState,
  lossFromOutcome,
  MAE_SCALE_MM,
  MISS_LOSS,
  normalizeClamped,
  W_CAP,
  W_FLOOR,
} from "./weights.ts";

const FIVE = ["open-meteo", "met-norway", "kma", "pirate-weather", "weather-api"];

/** Minimal DailySkillRecord — the updater only reads date, source, outcome, mae. */
function rec(date: string, source: ProviderId, outcome: RainOutcome, mae: number | null = null): DailySkillRecord {
  return {
    date,
    source,
    region: "seoul",
    pop: null,
    predicted_mm: mae === null ? null : 0,
    observed_mm: 0,
    predicted_rain: outcome === "false_alarm" || outcome === "hit",
    observed_rain: outcome === "miss" || outcome === "hit",
    outcome,
    contingency: { hits: 0, misses: 0, false_alarms: 0, correct_negatives: 0 },
    csi: null,
    categorical_skill: 0,
    quantitative_skill: null,
    mae,
    skill: 0,
    scoredAt: "2026-01-01T00:00:00.000Z",
  };
}

const total = (w: WeightsMap): number => Object.values(w).reduce((a, b) => a + b, 0);
const within = (w: WeightsMap, floor = W_FLOOR, cap = W_CAP): boolean =>
  Object.values(w).every((v) => v >= floor - 1e-9 && v <= cap + 1e-9);

test("config block keeps the loss ordering miss > false_alarm > worst hit", () => {
  const worstHit = HIT_BASE_LOSS + HIT_MAE_WEIGHT; // mae saturated
  assert.ok(MISS_LOSS > FALSE_ALARM_LOSS, "miss must be the costliest");
  assert.ok(FALSE_ALARM_LOSS > worstHit, "a false alarm must cost more than any hit");
});

test("lossFromOutcome: outcomes, hit amount term, and correct_dry skip", () => {
  assert.equal(lossFromOutcome("miss", null), MISS_LOSS);
  assert.equal(lossFromOutcome("false_alarm", null), FALSE_ALARM_LOSS);
  assert.equal(lossFromOutcome("hit", null), HIT_BASE_LOSS); // no amount → base only
  assert.equal(lossFromOutcome("hit", MAE_SCALE_MM / 2), HIT_BASE_LOSS + HIT_MAE_WEIGHT * 0.5);
  assert.equal(lossFromOutcome("hit", MAE_SCALE_MM * 5), HIT_BASE_LOSS + HIT_MAE_WEIGHT); // saturates at 1
  assert.equal(lossFromOutcome("correct_dry", null), null); // no update
});

test("coldStartWeights are equal and sum to 1", () => {
  const w = coldStartWeights(FIVE);
  assert.ok(Math.abs(total(w) - 1) < 1e-12);
  for (const v of Object.values(w)) assert.equal(v, 1 / FIVE.length);
});

test("normalizeClamped sums to ~1 and respects floor/cap, even for adversarial input", () => {
  // one runaway weight + several near-zero ones
  const out = normalizeClamped({ a: 1000, b: 0.0001, c: 0.0001, d: 0.0001, e: 0.0001 });
  assert.ok(Math.abs(total(out) - 1) < 1e-9, "must sum to 1");
  assert.ok(within(out), `must respect [${W_FLOOR}, ${W_CAP}]: ${JSON.stringify(out)}`);
  assert.ok(out.a <= W_CAP + 1e-9, "runaway weight is capped");
  assert.ok(out.b >= W_FLOOR - 1e-9, "starved weight is floored");
});

test("applyDayLosses: an empty loss map leaves weights untouched", () => {
  const w = coldStartWeights(FIVE);
  const out = applyDayLosses(w, new Map(), DEFAULT_ETA);
  assert.deepEqual(out, w);
});

test("a miss down-weights its source (and stays normalized & bounded)", () => {
  const w = coldStartWeights(FIVE);
  const out = applyDayLosses(w, new Map([["kma", MISS_LOSS]]), DEFAULT_ETA);
  assert.ok(out.kma < w.kma, "missed source loses share");
  assert.ok(Math.abs(total(out) - 1) < 1e-9);
  assert.ok(within(out));
});

test("repeated misses monotonically down-weight a source toward the floor", () => {
  let w = coldStartWeights(["a", "b", "c"]);
  let prev = w.a;
  for (let day = 0; day < 25; day++) {
    w = applyDayLosses(w, new Map([["a", MISS_LOSS]]), DEFAULT_ETA);
    assert.ok(w.a <= prev + 1e-12, "weight must never rise under a repeated miss");
    assert.ok(within(w) && Math.abs(total(w) - 1) < 1e-9);
    prev = w.a;
  }
  assert.ok(Math.abs(w.a - W_FLOOR) < 1e-6, "a persistent misser is pinned at the floor");
});

test("a miss down-weights strictly more than a false alarm for equal η", () => {
  const w = coldStartWeights(["a", "b"]);
  const missed = applyDayLosses(w, new Map([["a", MISS_LOSS]]), DEFAULT_ETA);
  const falseAlarmed = applyDayLosses(w, new Map([["a", FALSE_ALARM_LOSS]]), DEFAULT_ETA);
  assert.ok(missed.a < falseAlarmed.a, "miss must punish more than a false alarm");
});

test("applyUnprocessed: a correct_dry-only day produces zero weight change", () => {
  const s0 = initialWeightsState(FIVE);
  const s1 = applyUnprocessed(s0, [rec("2026-01-02", "kma", "correct_dry")], { now: new Date(0) });
  assert.deepEqual(s1.weights, s0.weights, "weights must not move");
  assert.equal(s1.eventsScored, 0, "correct_dry is not an informative event");
  assert.deepEqual(s1.processedDates, ["2026-01-02"], "date is still marked processed");
});

test("applyUnprocessed: informative events accumulate and weights move & stay bounded", () => {
  const s0 = initialWeightsState(FIVE);
  const records = [
    rec("2026-01-01", "open-meteo", "hit", 1),
    rec("2026-01-01", "kma", "miss"),
    rec("2026-01-01", "weather-api", "false_alarm"),
    rec("2026-01-02", "open-meteo", "hit", 0),
    rec("2026-01-02", "kma", "miss"),
  ];
  const s1 = applyUnprocessed(s0, records, { now: new Date(0) });
  assert.equal(s1.eventsScored, 5);
  assert.ok(within(s1.weights) && Math.abs(total(s1.weights) - 1) < 1e-9);
  assert.ok(s1.weights["kma"] < s1.weights["open-meteo"], "the repeated misser trails the hitter");
  assert.deepEqual(s1.processedDates, ["2026-01-01", "2026-01-02"]);
});

test("applyUnprocessed: re-applying the same dates is an idempotent no-op", () => {
  const s0 = initialWeightsState(FIVE);
  const records = [rec("2026-01-01", "kma", "miss"), rec("2026-01-01", "open-meteo", "hit", 2)];
  const s1 = applyUnprocessed(s0, records, { now: new Date(0) });
  const s2 = applyUnprocessed(s1, records, { now: new Date(1) }); // same records again
  assert.deepEqual(s2.weights, s1.weights, "weights must not change on re-apply");
  assert.equal(s2.eventsScored, s1.eventsScored, "events must not be double-counted");
  assert.deepEqual(s2.processedDates, s1.processedDates);
});

test("applyUnprocessed applies dates chronologically regardless of input order", () => {
  const s0 = initialWeightsState(["open-meteo", "kma"]);
  const shuffled = [
    rec("2026-01-03", "open-meteo", "miss"),
    rec("2026-01-01", "open-meteo", "hit", 0),
    rec("2026-01-02", "open-meteo", "false_alarm"),
  ];
  const s1 = applyUnprocessed(s0, shuffled, { now: new Date(0) });
  assert.deepEqual(s1.processedDates, ["2026-01-01", "2026-01-02", "2026-01-03"]);
  assert.equal(s1.eventsScored, 3);
});
