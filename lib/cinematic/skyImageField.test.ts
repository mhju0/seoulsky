import { test } from "node:test";
import assert from "node:assert/strict";
import { pickImageAnchor, selectSkyImage, type SkyImage } from "./skyImageField.ts";

const img = (
  landmark: string,
  condition: SkyImage["condition"],
  anchor: SkyImage["anchor"],
): SkyImage => ({
  landmark,
  condition,
  anchor,
  src: `/sky/${landmark}__${condition}__${anchor}.webp`,
});

const LIB: SkyImage[] = [
  img("hanriver", "clear", "day"),
  img("hanriver", "clear", "golden"),
  img("hanriver", "clear", "night"),
  img("hanriver", "rain", "day"),
  img("hanriver", "rain", "night"),
  img("hanriver", "overcast", "day"),
];

test("pickImageAnchor picks golden near the horizon, else day/night by isDay", () => {
  assert.equal(pickImageAnchor(true, 0.9), "golden");
  assert.equal(pickImageAnchor(false, 0.9), "golden"); // golden wins at dawn/dusk either side
  assert.equal(pickImageAnchor(true, 0.1), "day");
  assert.equal(pickImageAnchor(false, 0.1), "night");
});

test("selectSkyImage matches the exact condition + anchor", () => {
  const hit = selectSkyImage(LIB, "clear", "golden");
  assert.equal(hit?.src, "/sky/hanriver__clear__golden.webp");
});

test("selectSkyImage folds wet conditions onto the rain plate", () => {
  const hit = selectSkyImage(LIB, "drizzle", "day");
  assert.equal(hit?.condition, "rain");
  assert.equal(hit?.anchor, "day");
});

test("selectSkyImage borrows a neighbouring anchor only when the desired one is wholly absent", () => {
  // A day/night-only library: golden has NO plate of any condition, so rain must
  // fall to a temporal neighbour, still rain.
  const dayNight: SkyImage[] = [img("x", "rain", "day"), img("x", "rain", "night")];
  const hit = selectSkyImage(dayNight, "rain", "golden");
  assert.equal(hit?.condition, "rain");
  assert.ok(hit?.anchor === "day" || hit?.anchor === "night");
});

test("anchor is the HARD axis: any condition at the desired anchor beats the exact condition at a neighbour", () => {
  // rain desired at golden: there is no rain-golden, but a clear-golden exists.
  // Time coherence wins — we serve the correct-anchor (dry) plate rather than the
  // exact-condition rain plate at a different anchor (mirrors the video contract).
  const hit = selectSkyImage(LIB, "rain", "golden");
  assert.equal(hit?.anchor, "golden");
});

test("broadening condition stays within the desired anchor before crossing time", () => {
  // overcast has only a DAY plate; at night it must broaden within the dry family
  // to a correct-anchor plate (clear night) rather than serve its own day plate.
  const hit = selectSkyImage(LIB, "overcast", "night");
  assert.equal(hit?.anchor, "night");
  assert.notEqual(hit?.condition, "rain");
});

test("selectSkyImage broadens a dry sky to the dry family, never precip", () => {
  // partly-cloudy has no plate of its own → widen to clear/overcast, never rain/snow.
  const hit = selectSkyImage(LIB, "partly-cloudy", "day");
  assert.ok(hit);
  assert.ok(["clear", "overcast"].includes(hit!.condition));
});

test("selectSkyImage serves NO plate for a dry sky when only precip plates exist", () => {
  const onlyWet: SkyImage[] = [img("x", "rain", "day"), img("x", "snow", "night")];
  assert.equal(selectSkyImage(onlyWet, "clear", "day"), null);
  assert.equal(selectSkyImage(onlyWet, "partly-cloudy", "night"), null);
});

test("selectSkyImage broadens for unmappable conditions", () => {
  assert.ok(selectSkyImage(LIB, "unknown", "day"));
});

test("selectSkyImage returns null for an empty library", () => {
  assert.equal(selectSkyImage([], "clear", "day"), null);
});
