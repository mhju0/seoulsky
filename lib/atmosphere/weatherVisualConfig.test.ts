import { test } from "node:test";
import assert from "node:assert/strict";

import { computeSunPhase } from "../cinematic/seoulTime.ts";
import {
  buildVisualConfig,
  cloneVisualConfig,
  copyDiscrete,
  lerpVisualConfig,
  readAtmosphere,
  type VisualConfig,
} from "./weatherVisualConfig.ts";
import type { SkySnapshot, WeatherCondition } from "../types.ts";

const noonSun = computeSunPhase({
  now: new Date("2026-06-15T12:00:00+09:00"),
  sunrise: "2026-06-15T05:11:00+09:00",
  sunset: "2026-06-15T19:57:00+09:00",
});

function snap(overrides: Partial<SkySnapshot["current"]> = {}): SkySnapshot {
  return {
    observedAt: "2026-06-15T12:00:00+09:00",
    fetchedAt: "2026-06-15T12:00:00+09:00",
    fromCache: false,
    stale: false,
    current: {
      temperature: 24,
      apparentTemperature: 26,
      humidity: 60,
      windGusts: 18,
      windSpeed: 12,
      windDirection: 270,
      precipitation: 0,
      rain: 0,
      snowfall: 0,
      precipitationProbability: 10,
      cloudCover: 40,
      visibility: 16000,
      isDay: true,
      weatherCode: 2,
      condition: "partly-cloudy",
      ...overrides,
    },
    sun: { sunrise: "2026-06-15T05:11:00+09:00", sunset: "2026-06-15T19:57:00+09:00" },
    hourly: [],
    daily: [],
    air: null,
    radar: null,
    warnings: [],
    observationSource: "open-meteo",
    sources: ["open-meteo"],
  };
}

const inRange = (n: number, lo = 0, hi = 1) => Number.isFinite(n) && n >= lo && n <= hi;

function assertAllClamped(cfg: VisualConfig) {
  for (const k of [
    "skyWarmth",
    "hazeDensity",
    "cloudShadowStrength",
    "windDriftSpeed",
    "gust",
    "rainDistortion",
    "snowDensity",
    "lightDiffusion",
    "backgroundContrast",
    "grain",
    "sunIntensity",
    "horizonY",
  ] as const) {
    assert.ok(inRange(cfg[k]), `${k} out of 0..1: ${cfg[k]}`);
  }
  for (const c of [...cfg.skyTop, ...cfg.skyHorizon, ...cfg.skyBottom, ...cfg.accent, ...cfg.sunColor]) {
    assert.ok(inRange(c), `colour channel out of 0..1: ${c}`);
  }
  const wl = Math.hypot(cfg.windDir[0], cfg.windDir[1]);
  assert.ok(Math.abs(wl - 1) < 1e-6, `windDir not unit: ${wl}`);
}

test("a full snapshot yields an all-clamped config", () => {
  assertAllClamped(buildVisualConfig(noonSun, snap()));
});

test("a null snapshot still yields a complete, clamped fallback", () => {
  const cfg = buildVisualConfig(noonSun, null);
  assertAllClamped(cfg);
  assert.equal(cfg.precipType, "none");
});

test("every weather condition stays clamped and picks the right precip type", () => {
  const conditions: WeatherCondition[] = [
    "clear",
    "partly-cloudy",
    "cloudy",
    "overcast",
    "fog",
    "drizzle",
    "rain",
    "heavy-rain",
    "snow",
    "sleet",
    "thunderstorm",
  ];
  for (const condition of conditions) {
    const cfg = buildVisualConfig(noonSun, snap({ condition }));
    assertAllClamped(cfg);
    if (condition === "snow") assert.equal(cfg.precipType, "snow");
    if (["rain", "heavy-rain", "drizzle", "thunderstorm"].includes(condition))
      assert.equal(cfg.precipType, "rain");
  }
});

test("rain drives distortion, snow drives particles — mutually exclusive", () => {
  const rain = buildVisualConfig(noonSun, snap({ condition: "heavy-rain", precipitation: 5, precipitationProbability: 90 }));
  assert.ok(rain.rainDistortion > 0.4 && rain.snowDensity === 0);
  const snow = buildVisualConfig(noonSun, snap({ condition: "snow", precipitationProbability: 90 }));
  assert.ok(snow.snowDensity > 0.3 && snow.rainDistortion === 0);
});

test("extreme/garbage inputs never escape the clamp", () => {
  const cfg = buildVisualConfig(noonSun, snap({
    temperature: 999,
    humidity: 9000,
    windSpeed: 9000,
    windGusts: 9999,
    cloudCover: 9000,
    visibility: -50,
    precipitation: 9999,
    precipitationProbability: 9000,
    apparentTemperature: -999,
    condition: "thunderstorm",
  }));
  assertAllClamped(cfg);
});

test("lerp + copyDiscrete move live toward target without sharing refs", () => {
  const a = buildVisualConfig(noonSun, snap({ condition: "clear", temperature: 0 }));
  const b = buildVisualConfig(noonSun, snap({ condition: "snow", temperature: 30 }));
  const live = cloneVisualConfig(a);
  copyDiscrete(live, b);
  assert.equal(live.precipType, "snow");
  const beforeWarmth = live.skyWarmth;
  lerpVisualConfig(live, b, 0.5);
  assert.notEqual(live.skyWarmth, beforeWarmth);
  // mutating the clone must not touch the source
  live.skyTop[0] = 0.123;
  assert.notEqual(a.skyTop[0], 0.123);
});

test("readAtmosphere is null-safe", () => {
  const empty = readAtmosphere(null);
  assert.equal(empty.hasData, false);
  assert.equal(empty.temperature, null);
  const full = readAtmosphere(snap());
  assert.equal(full.hasData, true);
  assert.equal(full.temperature, 24);
});
