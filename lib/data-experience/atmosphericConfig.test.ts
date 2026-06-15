import { test } from "node:test";
import assert from "node:assert/strict";
import { computeSunPhase } from "../cinematic/seoulTime.ts";
import type { SkySnapshot, WeatherCondition } from "../types.ts";
import {
  buildAtmosphericConfig,
  buildHourPoints,
  cloneAtmosphericConfig,
  copyDiscreteAtmosphere,
  lerpAtmosphericConfig,
  readAtmosphere,
  type AtmosphericConfig,
} from "./atmosphericConfig.ts";

// Fixed Seoul summer day so sun-phase classification is deterministic.
const SUNRISE = "2026-06-14T05:11:00+09:00";
const SUNSET = "2026-06-14T19:53:00+09:00";
const MIDDAY = new Date("2026-06-14T12:00:00+09:00");
const SUNSET_T = new Date("2026-06-14T19:45:00+09:00");
const NIGHT = new Date("2026-06-14T23:30:00+09:00");

const dayPhase = computeSunPhase({ now: MIDDAY, sunrise: SUNRISE, sunset: SUNSET, isDayHint: true });
const sunsetPhase = computeSunPhase({ now: SUNSET_T, sunrise: SUNRISE, sunset: SUNSET });
const nightPhase = computeSunPhase({ now: NIGHT, sunrise: SUNRISE, sunset: SUNSET, isDayHint: false });

type CurrentPartial = Partial<SkySnapshot["current"]>;

function snapshot(current: CurrentPartial, hourly: SkySnapshot["hourly"] = []): SkySnapshot {
  return {
    observedAt: MIDDAY.toISOString(),
    fetchedAt: MIDDAY.toISOString(),
    fromCache: false,
    stale: false,
    current: {
      temperature: 18,
      apparentTemperature: 18,
      humidity: 50,
      windSpeed: 8,
      windGusts: null,
      windDirection: 270,
      precipitation: 0,
      rain: null,
      snowfall: null,
      precipitationProbability: 0,
      cloudCover: 10,
      visibility: 20000,
      isDay: true,
      weatherCode: 0,
      condition: "clear",
      ...current,
    },
    sun: { sunrise: SUNRISE, sunset: SUNSET },
    hourly,
    air: null,
    radar: null,
    warnings: [],
    observationSource: "open-meteo",
    sources: ["open-meteo"],
  };
}

const UNIT_FIELDS: (keyof AtmosphericConfig)[] = [
  "accentIntensity",
  "coreGlow",
  "thermalIntensity",
  "shellOpacity",
  "cloudDensity",
  "fogDensity",
  "condensation",
  "precipDensity",
  "windSpeedNorm",
  "gustNorm",
];

test("all 0..1 visual fields stay clamped under extreme inputs", () => {
  const extremes: CurrentPartial[] = [
    { temperature: 80, humidity: 200, windSpeed: 500, cloudCover: 999, precipitation: 999, precipitationProbability: 999, condition: "thunderstorm" },
    { temperature: -90, humidity: -50, windSpeed: -10, cloudCover: -10, precipitation: -5, precipitationProbability: -5, condition: "snow" },
  ];
  for (const e of extremes) {
    const cfg = buildAtmosphericConfig(dayPhase, snapshot(e));
    for (const f of UNIT_FIELDS) {
      const v = cfg[f] as number;
      assert.ok(v >= 0 && v <= 1, `${f}=${v} out of [0,1]`);
    }
    assert.ok(cfg.thermalExpansion >= 0.84 && cfg.thermalExpansion <= 1.18);
    const wl = Math.hypot(cfg.windVec[0], cfg.windVec[1]);
    assert.ok(Math.abs(wl - 1) < 1e-6, "windVec must be unit length");
  }
});

test("null snapshot yields a complete, in-range fallback config", () => {
  const cfg = buildAtmosphericConfig(dayPhase, null);
  for (const f of UNIT_FIELDS) {
    const v = cfg[f] as number;
    assert.ok(v >= 0 && v <= 1, `${f}=${v}`);
  }
  assert.equal(cfg.precipType, "none");
  assert.equal(cfg.accentName, "PALE CYAN"); // clear day default
});

test("accent follows condition, then time, then heat", () => {
  assert.equal(buildAtmosphericConfig(dayPhase, snapshot({ condition: "rain" })).accentName, "ELECTRIC BLUE");
  assert.equal(buildAtmosphericConfig(dayPhase, snapshot({ condition: "snow" })).accentName, "COLD WHITE-BLUE");
  assert.equal(buildAtmosphericConfig(dayPhase, snapshot({ condition: "clear" })).accentName, "PALE CYAN");
  assert.equal(buildAtmosphericConfig(nightPhase, snapshot({ condition: "clear" })).accentName, "DEEP COBALT");
  assert.equal(buildAtmosphericConfig(sunsetPhase, snapshot({ condition: "clear" })).accentName, "AMBER");
  assert.equal(buildAtmosphericConfig(dayPhase, snapshot({ condition: "clear", temperature: 33 })).accentName, "WARM ORANGE");
});

test("thermal intensity & expansion rise monotonically with temperature", () => {
  const cold = buildAtmosphericConfig(dayPhase, snapshot({ temperature: -5 }));
  const mild = buildAtmosphericConfig(dayPhase, snapshot({ temperature: 15 }));
  const hot = buildAtmosphericConfig(dayPhase, snapshot({ temperature: 34 }));
  assert.ok(cold.thermalIntensity < mild.thermalIntensity);
  assert.ok(mild.thermalIntensity < hot.thermalIntensity);
  assert.ok(cold.thermalExpansion < hot.thermalExpansion);
});

test("precipType matches condition; density is 0 when dry", () => {
  assert.equal(buildAtmosphericConfig(dayPhase, snapshot({ condition: "rain" })).precipType, "rain");
  assert.equal(buildAtmosphericConfig(dayPhase, snapshot({ condition: "snow" })).precipType, "snow");
  const dry = buildAtmosphericConfig(dayPhase, snapshot({ condition: "clear" }));
  assert.equal(dry.precipType, "none");
  assert.equal(dry.precipDensity, 0);
});

test("buildHourPoints normalizes a window and marks 'now'", () => {
  assert.deepEqual(buildHourPoints([], 12), []);
  assert.deepEqual(buildHourPoints(undefined, 12), []);
  const hourly: SkySnapshot["hourly"] = [10, 14, 6, 20].map((t, i) => ({
    time: `2026-06-14T${String(12 + i).padStart(2, "0")}:00:00+09:00`,
    temperature: t,
    precipitationProbability: null,
    windSpeed: 5,
    humidity: 50,
    condition: "clear" as WeatherCondition,
  }));
  const pts = buildHourPoints(hourly, 12);
  assert.equal(pts.length, 4);
  assert.equal(pts[0].isNow, true);
  assert.equal(pts[1].isNow, false);
  assert.equal(pts[2].tempRel, 0); // coldest (6°C) → 0
  assert.equal(pts[3].tempRel, 1); // warmest (20°C) → 1
  for (const p of pts) {
    assert.ok(p.tempAbs >= 0 && p.tempAbs <= 1);
    assert.equal(p.precipProbability, 0); // null → 0
  }
});

test("lerp moves the live config toward the target; clone is independent", () => {
  const a = buildAtmosphericConfig(dayPhase, snapshot({ temperature: 0, condition: "clear" }));
  const b = buildAtmosphericConfig(dayPhase, snapshot({ temperature: 30, condition: "rain" }));
  const live = cloneAtmosphericConfig(a);
  const startThermal = live.thermalIntensity;
  lerpAtmosphericConfig(live, b, 0.5);
  assert.ok(live.thermalIntensity > startThermal && live.thermalIntensity < b.thermalIntensity);
  // RGB arrays interpolate per-channel without aliasing the source arrays.
  assert.notEqual(live.accent, a.accent);
  // Discrete fields only change when explicitly copied.
  copyDiscreteAtmosphere(live, b);
  assert.equal(live.precipType, "rain");
});

test("readAtmosphere is null-safe and labels the condition", () => {
  const r = readAtmosphere(null);
  assert.equal(r.hasData, false);
  assert.equal(r.temperature, null);
  assert.equal(r.condition, "unknown");
  const r2 = readAtmosphere(snapshot({ condition: "rain", temperature: 12 }));
  assert.equal(r2.hasData, true);
  assert.equal(r2.temperature, 12);
  assert.equal(r2.conditionKo, "비");
});
