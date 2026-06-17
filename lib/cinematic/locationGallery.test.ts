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

test("selectGalleryPool never serves the opposite time of day", () => {
  // rain by day → a single day-rain clip exists; it must loop ALONE rather than
  // bleeding in the night-rain clips. Time-of-day coherence beats shuffle variety.
  const dayRain = selectGalleryPool(LIBRARY, "rain", true);
  assert.deepEqual(dayRain.map((c) => c.id), ["rain-day-a"]);
  assert.ok(dayRain.every((c) => c.timeOfDay === "day"));
});

test("selectGalleryPool loops the lone matching-time clip instead of bleeding conditions", () => {
  // snow has a single day clip and no overcast to widen to. Rather than opening
  // to the whole library (which would mix in clear/rain), keep the tight,
  // correct-time pool — even at size 1 — so the time of day stays coherent.
  const snow = selectGalleryPool(LIBRARY, "snow", true);
  assert.deepEqual(snow.map((c) => c.id), ["snow-day-a"]);
  assert.ok(snow.every((c) => c.timeOfDay === "day"));
});

// A richer library that lets the weather-adjacent broadening actually engage.
const RICH: LocationClip[] = [
  clip("clear-day", "clear", "day"),
  clip("clear-night", "clear", "night"),
  clip("pc-day", "partly-cloudy", "day"),
  clip("overcast-day", "overcast", "day"),
  clip("overcast-night", "overcast", "night"),
  clip("fog-night", "fog", "night"),
  clip("snow-day", "snow", "day"),
  clip("rain-night", "rain", "night"),
];

test("selectGalleryPool never serves a day clip at night (the 22:00-KST bug)", () => {
  // partly-cloudy has only DAY clips in RICH. At night it must broaden within the
  // dry family to the correct-time clips (clear/overcast night), NOT fall back to
  // its own daytime clips — the reported "daytime video at 22:00 KST" regression.
  const pcNight = selectGalleryPool(RICH, "partly-cloudy", false);
  assert.ok(pcNight.length >= 1);
  assert.ok(pcNight.every((c) => c.timeOfDay === "night"));
  assert.ok(pcNight.every((c) => c.condition !== "snow" && c.condition !== "rain"));
});

test("selectGalleryPool broadens partly-cloudy to the dry family, not snow/rain", () => {
  // Only one partly-cloudy clip → widen to clear + overcast (the dry family),
  // never to snow or rain (the reported snow-on-a-partly-cloudy-morning bug).
  const pc = selectGalleryPool(RICH, "partly-cloudy", true);
  assert.ok(pc.length >= 2);
  assert.ok(pc.every((c) => c.condition !== "snow" && c.condition !== "rain"));
  assert.ok(pc.every((c) => ["clear", "partly-cloudy", "overcast"].includes(c.condition)));
});

test("selectGalleryPool never serves snow/rain for a dry sky, even from the whole library", () => {
  // clear has 1 clip and no dry family to widen to → opens to the whole library,
  // but the dry-sky invariant still strips every snow/rain clip out.
  const sparseDry: LocationClip[] = [
    clip("clear-day", "clear", "day"),
    clip("snow-day", "snow", "day"),
    clip("snow-night", "snow", "night"),
    clip("rain-day", "rain", "day"),
  ];
  const clear = selectGalleryPool(sparseDry, "clear", true);
  assert.ok(clear.every((c) => c.condition !== "snow" && c.condition !== "rain"));
});

test("selectGalleryPool serves NO clip for a dry sky when only snow/rain exist", () => {
  // A library with zero dry clips: the whole-library fallback would otherwise
  // hand a clear/partly-cloudy sky a wet clip. The invariant must instead empty
  // the pool so the caller falls back to the procedural field — never snow/rain.
  const onlyWet: LocationClip[] = [
    clip("snow-day", "snow", "day"),
    clip("snow-night", "snow", "night"),
    clip("rain-day", "rain", "day"),
  ];
  assert.deepEqual(selectGalleryPool(onlyWet, "clear", true), []);
  assert.deepEqual(selectGalleryPool(onlyWet, "partly-cloudy", false), []);
});

test("selectGalleryPool widens fog and snow to overcast before the whole library", () => {
  // fog at night → fog + overcast only (no clear/snow/rain bleed-in).
  const fog = selectGalleryPool(RICH, "fog", false);
  assert.ok(fog.length >= 2);
  assert.ok(fog.every((c) => ["fog", "overcast"].includes(c.condition)));

  // snow by day → snow + overcast only.
  const snow = selectGalleryPool(RICH, "snow", true);
  assert.ok(snow.length >= 2);
  assert.ok(snow.every((c) => ["snow", "overcast"].includes(c.condition)));
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
