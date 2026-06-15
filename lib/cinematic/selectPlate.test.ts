import { test } from "node:test";
import assert from "node:assert/strict";
import { selectCinematicPlate, selectPlateFromSky, type PlateSelectionInput } from "./selectPlate.ts";

// Fixed Seoul day so sun-phase classification is deterministic.
const SUNRISE = "2026-06-14T05:11:00+09:00";
const SUNSET = "2026-06-14T19:53:00+09:00";
const MIDDAY = new Date("2026-06-14T12:00:00+09:00");
const PRE_DAWN = new Date("2026-06-14T04:40:00+09:00");
const DUSK = new Date("2026-06-14T20:00:00+09:00");
const NIGHT = new Date("2026-06-14T23:30:00+09:00");

function input(partial: Partial<PlateSelectionInput>): PlateSelectionInput {
  return {
    condition: "clear",
    cloudCover: 10,
    precipitation: 0,
    snowfall: 0,
    visibility: 20000,
    isDay: true,
    sunrise: SUNRISE,
    sunset: SUNSET,
    now: MIDDAY,
    ...partial,
  };
}

test("thunderstorm always wins → storm", () => {
  assert.equal(selectCinematicPlate(input({ condition: "thunderstorm", now: NIGHT })).key, "storm");
  assert.equal(selectCinematicPlate(input({ condition: "thunderstorm" })).key, "storm");
});

test("snow: condition, live snowfall, or 대설 warning → snow", () => {
  assert.equal(selectCinematicPlate(input({ condition: "snow" })).key, "snow");
  assert.equal(selectCinematicPlate(input({ condition: "clear", snowfall: 0.4 })).key, "snow");
  assert.equal(
    selectCinematicPlate(input({ condition: "cloudy", warnings: [{ type: "대설주의보" }] })).key,
    "snow",
  );
});

test("rain: wet conditions and heavy-rain/typhoon warnings → rain", () => {
  for (const c of ["drizzle", "rain", "heavy-rain", "sleet"] as const) {
    assert.equal(selectCinematicPlate(input({ condition: c })).key, "rain");
  }
  assert.equal(
    selectCinematicPlate(input({ condition: "clear", warnings: [{ type: "호우경보" }] })).key,
    "rain",
  );
  assert.equal(
    selectCinematicPlate(input({ condition: "cloudy", warnings: [{ type: "태풍주의보" }] })).key,
    "rain",
  );
});

test("rain ranks below snow (sleet stays rain, but snowfall forces snow)", () => {
  assert.equal(selectCinematicPlate(input({ condition: "sleet" })).key, "rain");
  assert.equal(selectCinematicPlate(input({ condition: "sleet", snowfall: 0.2 })).key, "snow");
});

test("fog: coded fog or very low visibility → fog", () => {
  assert.equal(selectCinematicPlate(input({ condition: "fog" })).key, "fog");
  assert.equal(selectCinematicPlate(input({ condition: "clear", visibility: 600 })).key, "fog");
  // Just above the threshold stays out of fog.
  assert.notEqual(selectCinematicPlate(input({ condition: "clear", visibility: 5000 })).key, "fog");
});

test("heavy cloud cover is time-aware: cloudy by day, overcast-night by night", () => {
  assert.equal(selectCinematicPlate(input({ condition: "overcast" })).key, "cloudy");
  assert.equal(selectCinematicPlate(input({ condition: "clear", cloudCover: 85 })).key, "cloudy");
  assert.equal(
    selectCinematicPlate(input({ condition: "overcast", now: NIGHT, isDay: false })).key,
    "overcast-night",
  );
});

test("clear/partly-cloudy resolves by sun phase", () => {
  assert.equal(selectCinematicPlate(input({ now: PRE_DAWN, isDay: false })).key, "dawn");
  assert.equal(selectCinematicPlate(input({ now: DUSK })).key, "sunset");
  assert.equal(selectCinematicPlate(input({ now: NIGHT, isDay: false })).key, "clear-night");
  assert.equal(selectCinematicPlate(input({ now: MIDDAY })).key, "clear-day");
  // partly-cloudy follows the same time path when cover is light.
  assert.equal(selectCinematicPlate(input({ condition: "partly-cloudy", cloudCover: 30 })).key, "clear-day");
});

test("mere rain probability never triggers a storm (only observed conditions count)", () => {
  // No probability field exists in the selector input by design; a clear sky
  // with light cloud stays a clear/time plate, never storm or rain.
  const sel = selectCinematicPlate(input({ condition: "clear", cloudCover: 40 }));
  assert.equal(sel.key, "clear-day");
});

test("selectPlateFromSky tolerates a null snapshot", () => {
  const sel = selectPlateFromSky(null, MIDDAY);
  assert.ok(sel.key.length > 0);
  assert.equal(typeof sel.reason, "string");
});

test("selection always reports the sun phase and isDay", () => {
  const sel = selectCinematicPlate(input({ now: MIDDAY }));
  assert.equal(sel.isDay, true);
  assert.equal(sel.phase, "daytime");
});
