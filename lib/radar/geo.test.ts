import { test } from "node:test";
import assert from "node:assert/strict";
import { CROP, CROP_H, CROP_W, GRID_NX, GRID_NY, SENTINEL } from "./grid.ts";
import {
  fitAffine,
  type GeoModel,
  lonLatToGrid,
  reproject,
  scanCropDecimals,
} from "./geo.ts";

// A synthetic Seoul-window lat/lon grid: linear in (ix,iy) with a small shear, so the
// affine model is exact (residual ~0) — exactly the regime the real Lambert grid is in.
function syntheticLatLon() {
  const crop = { ...CROP, w: CROP_W, h: CROP_H };
  const lon = new Float64Array(CROP_W * CROP_H);
  const lat = new Float64Array(CROP_W * CROP_H);
  const dlon = 0.85 / (CROP_W - 1);
  const dlat = 0.65 / (CROP_H - 1);
  for (let r = 0; r < CROP_H; r++) {
    for (let c = 0; c < CROP_W; c++) {
      const idx = r * CROP_W + c;
      lon[idx] = 126.5 + c * dlon + r * 0.0005; // tiny lon shear with row
      lat[idx] = 37.2 + r * dlat - c * 0.0003; // tiny lat shear with col
    }
  }
  return { crop, lon, lat };
}

function syntheticGeo(): GeoModel {
  const { crop, lon, lat } = syntheticLatLon();
  const fit = fitAffine(lon, lat, crop);
  return { product: "TEST", nx: GRID_NX, ny: GRID_NY, crop, ...fit, builtAt: "test" };
}

test("scanCropDecimals reads only the crop window, south-up, row-major", () => {
  const csv = "  4,  3,=\n" + Array.from({ length: 12 }, (_, i) => (10 + i).toFixed(1)).join(",");
  const out = scanCropDecimals(csv, 4, { ix0: 1, ix1: 2, iy0: 1, iy1: 2, w: 2, h: 2 });
  // k = iy*4 + ix; crop cells (1..2)×(1..2) → k = 5,6,9,10 → values 15,16,19,20
  assert.deepEqual([...out], [15, 16, 19, 20]);
});

test("fitAffine recovers a near-exact model and round-trips (lon,lat)→(ix,iy)", () => {
  const { crop, lon, lat } = syntheticLatLon();
  const fit = fitAffine(lon, lat, crop);
  assert.ok(fit.residualCells < 1e-6, `residual ${fit.residualCells}`);

  const geo = { ...syntheticGeo() };
  const c = 37;
  const r = 88;
  const idx = r * CROP_W + c;
  const { fx, fy } = lonLatToGrid(geo, lon[idx], lat[idx]);
  assert.ok(Math.abs(fx - (CROP.ix0 + c)) < 1e-3, `fx ${fx}`);
  assert.ok(Math.abs(fy - (CROP.iy0 + r)) < 1e-3, `fy ${fy}`);
});

test("fitAffine bbox spans the crop's lat/lon extent", () => {
  const fit = syntheticGeo();
  assert.ok(Math.abs(fit.bbox.west - 126.5) < 0.1);
  assert.ok(Math.abs(fit.bbox.north - 37.85) < 0.1);
  assert.ok(fit.bbox.south < fit.bbox.north && fit.bbox.west < fit.bbox.east);
});

test("reproject paints echo where there is signal and stays transparent elsewhere", () => {
  const geo = syntheticGeo();
  const crop = new Int16Array(CROP_W * CROP_H).fill(SENTINEL.noEcho);
  const cc = CROP_W >> 1;
  const cr = CROP_H >> 1;
  for (let r = cr - 10; r <= cr + 10; r++) {
    for (let c = cc - 10; c <= cc + 10; c++) crop[r * CROP_W + c] = 5000; // 50 dBZ core
  }

  const res = reproject(crop, geo, 200);
  assert.equal(res.width, 200);
  assert.ok(res.height > 0);

  const alphaAt = (px: number, py: number) => res.rgba[(py * res.width + px) * 4 + 3];
  assert.ok(alphaAt(100, Math.floor(res.height / 2)) > 0, "centre echo should be opaque");
  assert.equal(alphaAt(0, 0), 0, "NW corner (no echo) should be transparent");
});

test("reproject of an all-no-echo crop is fully transparent", () => {
  const geo = syntheticGeo();
  const crop = new Int16Array(CROP_W * CROP_H).fill(SENTINEL.noEcho);
  const res = reproject(crop, geo, 64);
  for (let i = 3; i < res.rgba.length; i += 4) assert.equal(res.rgba[i], 0);
});
