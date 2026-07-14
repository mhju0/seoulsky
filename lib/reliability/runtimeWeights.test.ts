import { test } from "node:test";
import assert from "node:assert/strict";
import type { WeightsState } from "./types.ts";
import {
  effectiveWeights,
  equalWeights,
  FULL_CONFIDENCE_EVENTS,
  gatePrecipWeighting,
  precipConfidence,
  WARMUP_EVENTS,
} from "./runtimeWeights.ts";

const SOURCES = ["open-meteo", "kma"];

function state(p: Partial<WeightsState>): WeightsState {
  return {
    updatedAt: new Date().toISOString(),
    eventsScored: 0,
    processedDates: [],
    weights: { "open-meteo": 0.5, "met-norway": 0.05, kma: 0.05, "pirate-weather": 0.3, "weather-api": 0.1 },
    ...p,
  };
}

const sum = (w: Record<string, number>): number => Object.values(w).reduce((a, b) => a + b, 0);

test("precipConfidence ramps 0 → 1 between WARMUP and FULL_CONFIDENCE", () => {
  assert.equal(precipConfidence(0), 0);
  assert.equal(precipConfidence(WARMUP_EVENTS), 0); // at warm-up, still pure equal
  assert.equal(precipConfidence(FULL_CONFIDENCE_EVENTS), 1);
  assert.equal(precipConfidence(FULL_CONFIDENCE_EVENTS + 10), 1); // clamped
  const mid = WARMUP_EVENTS + (FULL_CONFIDENCE_EVENTS - WARMUP_EVENTS) / 2;
  assert.ok(Math.abs(precipConfidence(mid) - 0.5) < 1e-12);
});

test("equalWeights are uniform and sum to 1", () => {
  const w = equalWeights(SOURCES);
  assert.ok(Math.abs(sum(w) - 1) < 1e-12);
  assert.equal(w["open-meteo"], 0.5);
  assert.equal(w["kma"], 0.5);
});

test("gate: missing weights state → equal-fallback", () => {
  const g = gatePrecipWeighting(null, SOURCES, new Date());
  assert.equal(g.mode, "equal-fallback");
  assert.equal(g.reason, "no-weights-state");
  assert.equal(g.confidence, 0);
  assert.deepEqual(g.weights, equalWeights(SOURCES));
});

test("gate: checkpoint beyond bounded clock skew → equal-fallback", () => {
  const now = new Date("2026-07-14T00:00:00.000Z");
  const future = new Date(now.getTime() + 86_400_000).toISOString();
  const g = gatePrecipWeighting(state({ updatedAt: future, eventsScored: 50 }), SOURCES, now);
  assert.equal(g.mode, "equal-fallback");
  assert.equal(g.reason, "future-checkpoint");
  assert.deepEqual(g.weights, equalWeights(SOURCES));
});

test("gate: stale observation-cycle checkpoint → equal-fallback", () => {
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const g = gatePrecipWeighting(state({ updatedAt: tenDaysAgo, eventsScored: 50 }), SOURCES, new Date());
  assert.equal(g.mode, "equal-fallback");
  assert.equal(g.reason, "stale");
  assert.deepEqual(g.weights, equalWeights(SOURCES));
});

test("gate: below WARMUP_EVENTS → pure equal", () => {
  const g = gatePrecipWeighting(state({ eventsScored: WARMUP_EVENTS - 2 }), SOURCES, new Date());
  assert.equal(g.mode, "equal-fallback");
  assert.equal(g.reason, "pre-warmup");
  assert.equal(g.confidence, 0);
  assert.deepEqual(g.weights, equalWeights(SOURCES));
});

test("gate: eventsScored ≥ FULL_CONFIDENCE_EVENTS → learned weights applied", () => {
  const g = gatePrecipWeighting(state({ eventsScored: FULL_CONFIDENCE_EVENTS + 5 }), SOURCES, new Date());
  assert.equal(g.mode, "learned");
  assert.equal(g.confidence, 1);
  assert.ok(Math.abs(sum(g.weights) - 1) < 1e-12);
  // learned weights restricted to [om, kma] and renormalized: 0.5/0.55, 0.05/0.55
  assert.ok(Math.abs(g.weights["open-meteo"] - 0.5 / 0.55) < 1e-12);
  assert.ok(Math.abs(g.weights["kma"] - 0.05 / 0.55) < 1e-12);
  // and it actually differs from equal (the whole point)
  assert.ok(g.weights["open-meteo"] > 0.5);
});

test("gate: intermediate count ramps — effective = lerp(equal, learned, confidence)", () => {
  const events = WARMUP_EVENTS + (FULL_CONFIDENCE_EVENTS - WARMUP_EVENTS) / 2; // confidence 0.5
  const g = gatePrecipWeighting(state({ eventsScored: events }), SOURCES, new Date());
  assert.equal(g.mode, "ramping");
  assert.ok(Math.abs(g.confidence - 0.5) < 1e-12);
  const learnedOm = 0.5 / 0.55;
  const expectedOm = 0.5 * 0.5 + 0.5 * learnedOm; // (1-c)*equal + c*learned
  assert.ok(Math.abs(g.weights["open-meteo"] - expectedOm) < 1e-12);
  assert.ok(Math.abs(sum(g.weights) - 1) < 1e-12);
  // strictly between equal and learned
  assert.ok(g.weights["open-meteo"] > 0.5 && g.weights["open-meteo"] < learnedOm);
});

test("effectiveWeights: confidence 0 → equal, confidence 1 → learned", () => {
  const s = state({ eventsScored: 30 });
  assert.deepEqual(effectiveWeights(s, SOURCES, 0), equalWeights(SOURCES));
  const full = effectiveWeights(s, SOURCES, 1);
  assert.ok(Math.abs(full["open-meteo"] - 0.5 / 0.55) < 1e-12);
});
