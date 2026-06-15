import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapToGalleryCondition,
  selectGalleryPool,
  pickNextClip,
  type LocationClip,
} from "./locationGallery.ts";

const clip = (
  id: string,
  condition: LocationClip["condition"],
  timeOfDay: LocationClip["timeOfDay"],
): LocationClip => ({
  id,
  location: id,
  condition,
  timeOfDay,
  mp4: `/cinematic/locations/${id}.mp4`,
  webm: null,
});

const LIBRARY: LocationClip[] = [
  clip("clear-day-a", "clear", "day"),
  clip("clear-night-a", "clear", "night"),
  clip("rain-day-a", "rain", "day"),
  clip("rain-night-a", "rain", "night"),
  clip("rain-night-b", "rain", "night"),
  clip("snow-day-a", "snow", "day"),
];

test("mapToGalleryCondition folds wet conditions into the rain bucket", () => {
  assert.equal(mapToGalleryCondition("drizzle"), "rain");
  assert.equal(mapToGalleryCondition("rain"), "rain");
  assert.equal(mapToGalleryCondition("heavy-rain"), "rain");
  assert.equal(mapToGalleryCondition("sleet"), "rain");
  assert.equal(mapToGalleryCondition("thunderstorm"), "rain");
  assert.equal(mapToGalleryCondition("cloudy"), "overcast");
  assert.equal(mapToGalleryCondition("overcast"), "overcast");
  assert.equal(mapToGalleryCondition("partly-cloudy"), "partly-cloudy");
  assert.equal(mapToGalleryCondition("snow"), "snow");
  assert.equal(mapToGalleryCondition("fog"), "fog");
  assert.equal(mapToGalleryCondition("unknown"), null);
});

test("selectGalleryPool prefers matching condition + time-of-day", () => {
  // rain at night → both night-rain clips (≥2 ⇒ honoured).
  const nightRain = selectGalleryPool(LIBRARY, "rain", false);
  assert.deepEqual(
    nightRain.map((c) => c.id).sort(),
    ["rain-night-a", "rain-night-b"],
  );
});

test("selectGalleryPool keeps the condition pool when time-of-day has <2", () => {
  // rain by day → only one day-rain clip, so the whole rain pool is used.
  const dayRain = selectGalleryPool(LIBRARY, "rain", true);
  assert.deepEqual(
    dayRain.map((c) => c.id).sort(),
    ["rain-day-a", "rain-night-a", "rain-night-b"],
  );
});

test("selectGalleryPool broadens to the whole library when <2 match", () => {
  // snow has a single clip → broaden to everything so there is ≥2 to shuffle.
  const snow = selectGalleryPool(LIBRARY, "snow", true);
  assert.ok(snow.length >= 2);
  // Day preference then narrows the broadened pool to the day clips.
  assert.ok(snow.every((c) => c.timeOfDay === "day"));
});

test("selectGalleryPool broadens for unmappable conditions", () => {
  const unknown = selectGalleryPool(LIBRARY, "unknown", false);
  assert.ok(unknown.length >= 2);
});

test("selectGalleryPool returns [] for an empty library", () => {
  assert.deepEqual(selectGalleryPool([], "clear", true), []);
});

test("pickNextClip never repeats the current clip when alternatives exist", () => {
  const pool = LIBRARY.slice(0, 3);
  // rand=0 would pick index 0; with current=pool[0] it must skip to another.
  const next = pickNextClip(pool, pool[0].id, () => 0);
  assert.notEqual(next?.id, pool[0].id);
});

test("pickNextClip with a single-clip pool returns that clip", () => {
  const pool = [clip("solo", "fog", "day")];
  assert.equal(pickNextClip(pool, "solo")?.id, "solo");
});

test("pickNextClip returns null for an empty pool", () => {
  assert.equal(pickNextClip([], null), null);
});
