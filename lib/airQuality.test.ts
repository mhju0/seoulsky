import { test } from "node:test";
import assert from "node:assert/strict";
import { aerosolFromAir, koreanAqiBand } from "./airQuality.ts";
import type { NormalizedAirQuality } from "./types";

const aq = (p: Partial<NormalizedAirQuality>): NormalizedAirQuality => ({
  pm25: null,
  pm10: null,
  ozone: null,
  no2: null,
  aerosolOpticalDepth: null,
  dust: null,
  uvIndex: null,
  band: null,
  station: null,
  observedAt: null,
  source: "open-meteo-air-quality",
  stale: false,
  ...p,
});

test("koreanAqiBand: PM2.5 breakpoints (좋음/보통/나쁨/매우나쁨)", () => {
  assert.equal(koreanAqiBand(10, null), 1);
  assert.equal(koreanAqiBand(30, null), 2);
  assert.equal(koreanAqiBand(60, null), 3);
  assert.equal(koreanAqiBand(120, null), 4);
  assert.equal(koreanAqiBand(null, null), null);
});

test("koreanAqiBand: worse of PM2.5 / PM10 wins", () => {
  assert.equal(koreanAqiBand(10, 200), 4); // clean PM2.5 but extreme PM10 (황사)
  assert.equal(koreanAqiBand(30, 10), 2); // PM2.5 보통 drives over clean PM10
  assert.equal(koreanAqiBand(40, 10), 3); // PM2.5 > 35 → 나쁨
});

test("aerosolFromAir: clean ≈ 0, heavy ≈ 1, clamped to a believable range", () => {
  assert.equal(aerosolFromAir(null), 0);
  assert.ok(aerosolFromAir(aq({ pm25: 8 })) < 0.12);
  const mid = aerosolFromAir(aq({ pm25: 35 }));
  assert.ok(mid > 0.2 && mid < 0.45, `mid=${mid}`);
  assert.equal(aerosolFromAir(aq({ pm10: 400 })), 1); // clamped, never > 1
  assert.equal(aerosolFromAir(aq({ aerosolOpticalDepth: 2 })), 1); // clamped
});

test("aerosolFromAir: takes the worst available signal", () => {
  const v = aerosolFromAir(aq({ pm25: 8, pm10: 160 }));
  assert.ok(v > 0.8, `expected PM10 to dominate, got ${v}`);
});
