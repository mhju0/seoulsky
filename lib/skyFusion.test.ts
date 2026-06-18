import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseCurrent, fuseWeightedPrecip, isPrecip, reweightForecastPrecip } from "./skyFusion.ts";
import type { CurrentWeather, DailyForecast, HourlyForecast } from "./types";

const cw = (p: Partial<CurrentWeather>): CurrentWeather => ({
  time: "2026-06-14T12:00:00+09:00",
  temperature: 0,
  apparentTemperature: null,
  humidity: null,
  windSpeed: null,
  windDirection: null,
  precipitation: null,
  cloudCover: null,
  condition: "clear",
  ...p,
});

const om = { temperature: 20, condition: "overcast" as const, precipitation: 0 };

test("chooseCurrent: no KMA → everything from Open-Meteo", () => {
  const c = chooseCurrent(om, null);
  assert.equal(c.temperature, 20);
  assert.equal(c.condition, "overcast");
  assert.equal(c.temperatureSource, "open-meteo");
  assert.equal(c.conditionSource, "open-meteo");
});

test("chooseCurrent: KMA temperature always wins when present", () => {
  const c = chooseCurrent(om, cw({ temperature: 22.8, condition: "cloudy" }));
  assert.equal(c.temperature, 22.8);
  assert.equal(c.temperatureSource, "kma");
});

test("chooseCurrent: KMA condition wins ONLY when it reports active precip", () => {
  // KMA says rain → trust KMA (ground truth it's precipitating)
  const rainy = chooseCurrent(om, cw({ temperature: 18, condition: "rain", precipitation: 2.5 }));
  assert.equal(rainy.condition, "rain");
  assert.equal(rainy.conditionSource, "kma");
  assert.equal(rainy.precipitation, 2.5);

  // KMA dry (no precip category) → keep Open-Meteo's richer cloud reading
  const dry = chooseCurrent(om, cw({ temperature: 18, condition: "clear", precipitation: 0 }));
  assert.equal(dry.condition, "overcast"); // from Open-Meteo
  assert.equal(dry.conditionSource, "open-meteo");
  assert.equal(dry.temperature, 18); // still KMA temp
});

test("chooseCurrent: null KMA precip falls back to Open-Meteo precip", () => {
  const c = chooseCurrent({ ...om, precipitation: 1.2 }, cw({ temperature: 19, precipitation: null }));
  assert.equal(c.precipitation, 1.2);
});

test("isPrecip classifies precipitation conditions", () => {
  for (const p of ["rain", "heavy-rain", "snow", "sleet", "drizzle"] as const) {
    assert.equal(isPrecip(p), true);
  }
  for (const c of ["clear", "partly-cloudy", "cloudy", "overcast", "fog"] as const) {
    assert.equal(isPrecip(c), false);
  }
});

// ── Phase 3: gated precip-only weighting ─────────────────────────────────────

test("fuseWeightedPrecip blends multiple sources by weight (learned weights applied)", () => {
  const contribs = [
    { source: "open-meteo" as const, pop: 0, predicted_mm: 0 },
    { source: "kma" as const, pop: 100, predicted_mm: 10 },
  ];
  // equal → simple average
  assert.equal(fuseWeightedPrecip(contribs, { "open-meteo": 0.5, kma: 0.5 }).pop, 50);
  // learned (kma-heavy) → pulled toward kma; self-normalizes over present sources
  const learned = fuseWeightedPrecip(contribs, { "open-meteo": 0.2, kma: 0.8 });
  assert.equal(learned.pop, 80);
  assert.equal(learned.predicted_mm, 8);
  assert.notEqual(learned.pop, 50); // weights genuinely changed the consensus
});

test("fuseWeightedPrecip: single source is the identity; nulls are skipped", () => {
  assert.deepEqual(fuseWeightedPrecip([{ source: "open-meteo", pop: 42, predicted_mm: 3 }], { "open-meteo": 0.137 }), {
    pop: 42,
    predicted_mm: 3,
  });
  // a null field drops out of its own average
  const r = fuseWeightedPrecip(
    [
      { source: "open-meteo", pop: null, predicted_mm: 4 },
      { source: "kma", pop: 60, predicted_mm: null },
    ],
    { "open-meteo": 0.5, kma: 0.5 },
  );
  assert.equal(r.pop, 60); // only kma had a pop
  assert.equal(r.predicted_mm, 4); // only open-meteo had an amount
});

const daily = (p: Partial<DailyForecast>): DailyForecast => ({
  date: "2026-06-19",
  temperatureMax: 27,
  temperatureMin: 19,
  precipitationProbability: 60,
  condition: "rain",
  sunrise: "2026-06-19T05:11:00+09:00",
  sunset: "2026-06-19T19:57:00+09:00",
  precipitationAmount: 4.2,
  ...p,
});

const hourly = (p: Partial<HourlyForecast>): HourlyForecast => ({
  time: "2026-06-19T12:00:00+09:00",
  temperature: 24,
  precipitationProbability: 55,
  windSpeed: 9,
  humidity: 70,
  condition: "rain",
  ...p,
});

test("reweightForecastPrecip is the identity for the single live forecast source", () => {
  const input = {
    daily: [daily({}), daily({ date: "2026-06-20", precipitationProbability: null })],
    hourly: [hourly({}), hourly({ time: "2026-06-19T13:00:00+09:00", precipitationProbability: null })],
    currentPrecipitationProbability: 30 as number | null,
  };
  // Even with non-equal weights, a single contributing source returns its own values.
  const out = reweightForecastPrecip(input, "open-meteo", { "open-meteo": 0.9, kma: 0.1 });
  assert.deepEqual(out, input); // byte-for-byte: nothing moved
});

test("reweightForecastPrecip touches PRECIP fields ONLY — non-precip is identical", () => {
  const base = daily({ temperatureMax: 31, condition: "rain", sunrise: "2026-06-19T05:11:00+09:00" });
  const [out] = reweightForecastPrecip(
    { daily: [base], hourly: [], currentPrecipitationProbability: null },
    "open-meteo",
    { "open-meteo": 0.42, kma: 0.58 },
  ).daily;
  // non-precip fields preserved exactly
  assert.equal(out.temperatureMax, base.temperatureMax);
  assert.equal(out.temperatureMin, base.temperatureMin);
  assert.equal(out.condition, base.condition);
  assert.equal(out.sunrise, base.sunrise);
  assert.equal(out.sunset, base.sunset);
  assert.equal(out.date, base.date);
});

test("behavior preservation: NO weights file (state null) → fused forecast identical", () => {
  const input = {
    daily: [daily({}), daily({ date: "2026-06-20" })],
    hourly: [hourly({}), hourly({ time: "2026-06-19T14:00:00+09:00" })],
    currentPrecipitationProbability: 30 as number | null,
  };
  // The route uses gatePrecipWeighting(null, …).weights here = equal over the live
  // single source, so the reweight is the identity → pre-Phase-3 output unchanged.
  const equalSingle = { "open-meteo": 1 };
  assert.deepEqual(reweightForecastPrecip(input, "open-meteo", equalSingle), input);
});

test("reweightForecastPrecip never adds a precipitationAmount where the field was absent", () => {
  const noAmount = daily({});
  delete (noAmount as { precipitationAmount?: number | null }).precipitationAmount;
  const [out] = reweightForecastPrecip(
    { daily: [noAmount], hourly: [], currentPrecipitationProbability: null },
    "open-meteo",
    { "open-meteo": 1 },
  ).daily;
  assert.ok(!("precipitationAmount" in out), "absent amount must stay absent (payload shape unchanged)");
});
