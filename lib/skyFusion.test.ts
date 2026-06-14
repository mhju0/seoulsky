import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseCurrent, isPrecip } from "./skyFusion.ts";
import type { CurrentWeather } from "./types";

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
