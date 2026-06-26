import { test } from "node:test";
import assert from "node:assert/strict";
import {
  latToMercNorm,
  latToWorldY,
  lonToMercNorm,
  lonToWorldX,
  mercNormToLat,
  TILE_SIZE,
} from "./mercator.ts";

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("normalized x/y anchor at the expected world corners", () => {
  close(lonToMercNorm(-180), 0);
  close(lonToMercNorm(0), 0.5);
  close(lonToMercNorm(180), 1);
  close(latToMercNorm(0), 0.5);
  assert.ok(latToMercNorm(85) < 0.01); // far north → near top
  assert.ok(latToMercNorm(-85) > 0.99); // far south → near bottom
});

test("latitude ↔ normalized-y round-trips (incl. Seoul)", () => {
  for (const lat of [-60, -37.5, 0, 37.5, 37.5665, 60]) {
    close(mercNormToLat(latToMercNorm(lat)), lat, 1e-7);
  }
});

test("world pixels scale by 2^z and y increases southward", () => {
  close(lonToWorldX(0, 0), TILE_SIZE / 2);
  close(lonToWorldX(127, 3), lonToWorldX(127, 0) * 8);
  // Seoul is north of the equator → worldY above the equator line.
  assert.ok(latToWorldY(37.5, 10) < latToWorldY(0, 10));
  assert.ok(latToWorldY(37.2, 10) > latToWorldY(37.85, 10)); // south is below north
});
