import { test } from "node:test";
import assert from "node:assert/strict";
import { frameKey, frameKeyToIso, isValidFrameKey, latestFrameInstant } from "./kma.ts";

test("isValidFrameKey accepts a 12-digit KST key and rejects everything else", () => {
  assert.equal(isValidFrameKey("202606261105"), true);
  assert.equal(isValidFrameKey("2026062611"), false); // too short
  assert.equal(isValidFrameKey("2026062611055"), false); // too long
  assert.equal(isValidFrameKey("20260626110a"), false); // non-digit
  assert.equal(isValidFrameKey("../../etc/passwd"), false); // path traversal
  assert.equal(isValidFrameKey(""), false);
});

test("frameKey ↔ frameKeyToIso round-trips through the KST shift", () => {
  const key = "202606261105";
  const iso = frameKeyToIso(key);
  // KST 11:05 → 02:05 UTC the same day.
  assert.equal(iso, "2026-06-26T02:05:00.000Z");
  const kstShifted = new Date(Date.parse(iso) + 9 * 3600_000);
  assert.equal(frameKey(kstShifted), key);
});

test("latestFrameInstant lands on a 5-minute KST boundary", () => {
  const key = frameKey(latestFrameInstant());
  assert.match(key, /^\d{12}$/);
  assert.equal(Number(key.slice(10, 12)) % 5, 0);
});
