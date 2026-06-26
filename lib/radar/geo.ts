import {
  CROP,
  CROP_H,
  CROP_W,
  dbzFromRaw,
  dbzToRgba,
  GRID_NX,
  GRID_NY,
  type Rgba,
} from "./grid.ts";
import { latToMercNorm, lonToMercNorm, mercNormToLat } from "./mercator.ts";

/**
 * Georeferencing for the Seoul radar crop. The KMA grid is Lambert Conformal Conic and
 * slightly sheared, so we never assume north-up: we fit a centred affine model from the
 * per-cell lat/lon (fetched once from `nph-rdr_latlon_api`, see apihub.ts) that maps
 * (lon,lat) → fractional grid (ix,iy), then reproject the cropped reflectivity into a
 * **Web-Mercator-aligned** RGBA raster. Because the output shares Web Mercator with the
 * basemap tiles, the client can place it by its lat/lon bbox corners and the echo
 * registers on the map exactly. Over this ~76 km window the affine residual is < 0.4
 * cell (~190 m), i.e. sub-pixel at scope scale.
 *
 * Pure module (no fs/network): apihub.ts does the fetch + disk cache and calls buildGeo.
 */

export interface GeoModel {
  product: string;
  nx: number;
  ny: number;
  crop: { ix0: number; ix1: number; iy0: number; iy1: number; w: number; h: number };
  /** Lat/lon extent of the crop (the Mercator-aligned echo raster spans this box). */
  bbox: { west: number; east: number; south: number; north: number };
  corners: {
    sw: [number, number];
    se: [number, number];
    nw: [number, number];
    ne: [number, number];
  };
  /** Centring used by the affine model (improves conditioning). */
  ref: { lon0: number; lat0: number; cxi: number; cyi: number };
  /** (lon−lon0, lat−lat0) → (ix−cxi, iy−cyi): ix' = a·lon'+b·lat'+c, iy' = d·lon'+e·lat'+f. */
  inv: { a: number; b: number; c: number; d: number; e: number; f: number };
  residualCells: number;
  builtAt: string;
}

/** (lon,lat) → fractional absolute grid coords (ix,iy) via the affine model. */
export function lonLatToGrid(geo: GeoModel, lon: number, lat: number): { fx: number; fy: number } {
  const lo = lon - geo.ref.lon0;
  const la = lat - geo.ref.lat0;
  const { a, b, c, d, e, f } = geo.inv;
  return {
    fx: geo.ref.cxi + a * lo + b * la + c,
    fy: geo.ref.cyi + d * lo + e * la + f,
  };
}

// ---- building the model from the latlon CSV grids ----------------------------

/**
 * Scan a KMA latlon CSV (`  nx,  ny,=` header then row-major decimals, iy=0 south) and
 * return only the crop-window values, south-up: out[(iy−iy0)·w + (ix−ix0)]. O(1) memory
 * beyond the text + the small window. Parameterised on dims for testability.
 */
export function scanCropDecimals(
  text: string,
  nx: number,
  crop: { ix0: number; ix1: number; iy0: number; iy1: number; w: number; h: number },
): Float64Array {
  const out = new Float64Array(crop.w * crop.h);
  const re = /-?\d+\.\d+/g; // header integers (nx, ny) have no decimal point → skipped
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    const ix = k % nx;
    const iy = (k - ix) / nx;
    if (ix >= crop.ix0 && ix <= crop.ix1 && iy >= crop.iy0 && iy <= crop.iy1) {
      out[(iy - crop.iy0) * crop.w + (ix - crop.ix0)] = +m[0];
    }
    k++;
  }
  return out;
}

function solve3(A: number[][], y: number[]): [number, number, number] {
  const M = A.map((r, i) => [...r, y[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const fac = M[r][c] / M[c][c];
      for (let col = c; col < 4; col++) M[r][col] -= fac * M[c][col];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/** Least-squares fit of the centred affine inverse model from crop lat/lon arrays. */
export function fitAffine(
  lonCrop: Float64Array,
  latCrop: Float64Array,
  crop: { ix0: number; ix1: number; iy0: number; iy1: number; w: number; h: number },
): Pick<GeoModel, "bbox" | "corners" | "ref" | "inv" | "residualCells"> {
  const at = (g: Float64Array, ix: number, iy: number) =>
    g[(iy - crop.iy0) * crop.w + (ix - crop.ix0)];

  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (let i = 0; i < lonCrop.length; i++) {
    if (lonCrop[i] < west) west = lonCrop[i];
    if (lonCrop[i] > east) east = lonCrop[i];
    if (latCrop[i] < south) south = latCrop[i];
    if (latCrop[i] > north) north = latCrop[i];
  }
  const lon0 = (west + east) / 2;
  const lat0 = (south + north) / 2;
  const cxi = (crop.ix0 + crop.ix1) / 2;
  const cyi = (crop.iy0 + crop.iy1) / 2;

  let Sxx = 0;
  let Sxy = 0;
  let Sx = 0;
  let Syy = 0;
  let Sy = 0;
  let Sn = 0;
  const bIx = [0, 0, 0];
  const bIy = [0, 0, 0];
  for (let iy = crop.iy0; iy <= crop.iy1; iy++) {
    for (let ix = crop.ix0; ix <= crop.ix1; ix++) {
      const lo = at(lonCrop, ix, iy) - lon0;
      const la = at(latCrop, ix, iy) - lat0;
      Sxx += lo * lo;
      Sxy += lo * la;
      Sx += lo;
      Syy += la * la;
      Sy += la;
      Sn += 1;
      bIx[0] += lo * (ix - cxi);
      bIx[1] += la * (ix - cxi);
      bIx[2] += ix - cxi;
      bIy[0] += lo * (iy - cyi);
      bIy[1] += la * (iy - cyi);
      bIy[2] += iy - cyi;
    }
  }
  const A = [
    [Sxx, Sxy, Sx],
    [Sxy, Syy, Sy],
    [Sx, Sy, Sn],
  ];
  const [a, b, c] = solve3(A, bIx);
  const [d, e, f] = solve3(A, bIy);

  let residual = 0;
  for (let iy = crop.iy0; iy <= crop.iy1; iy++) {
    for (let ix = crop.ix0; ix <= crop.ix1; ix++) {
      const lo = at(lonCrop, ix, iy) - lon0;
      const la = at(latCrop, ix, iy) - lat0;
      residual = Math.max(residual, Math.abs(cxi + a * lo + b * la + c - ix));
      residual = Math.max(residual, Math.abs(cyi + d * lo + e * la + f - iy));
    }
  }

  return {
    bbox: { west, east, south, north },
    corners: {
      sw: [at(latCrop, crop.ix0, crop.iy0), at(lonCrop, crop.ix0, crop.iy0)],
      se: [at(latCrop, crop.ix1, crop.iy0), at(lonCrop, crop.ix1, crop.iy0)],
      nw: [at(latCrop, crop.ix0, crop.iy1), at(lonCrop, crop.ix0, crop.iy1)],
      ne: [at(latCrop, crop.ix1, crop.iy1), at(lonCrop, crop.ix1, crop.iy1)],
    },
    ref: { lon0, lat0, cxi, cyi },
    inv: { a, b, c, d, e, f },
    residualCells: residual,
  };
}

/** Build the full GeoModel from the lon/lat CSV grids (one-time; cached by apihub.ts). */
export function buildGeo(lonText: string, latText: string): GeoModel {
  const crop = { ...CROP, w: CROP_W, h: CROP_H };
  const lonCrop = scanCropDecimals(lonText, GRID_NX, crop);
  const latCrop = scanCropDecimals(latText, GRID_NX, crop);
  const fit = fitAffine(lonCrop, latCrop, crop);
  return {
    product: "HSR",
    nx: GRID_NX,
    ny: GRID_NY,
    crop,
    ...fit,
    builtAt: new Date().toISOString(),
  };
}

// ---- reprojection to a Mercator-aligned RGBA raster --------------------------

/** Bilinear dBZ at crop-local coords (cx east, cy north-from-south); null = transparent. */
function sampleDbz(crop: Int16Array, cx: number, cy: number): number | null {
  if (cx < 0 || cy < 0 || cx > CROP_W - 1 || cy > CROP_H - 1) return null;
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(x0 + 1, CROP_W - 1);
  const y1 = Math.min(y0 + 1, CROP_H - 1);
  const tx = cx - x0;
  const ty = cy - y0;
  // No-data/no-echo neighbours read as 0 dBZ so echo edges fade smoothly to transparent.
  const v = (xx: number, yy: number) => dbzFromRaw(crop[yy * CROP_W + xx]) ?? 0;
  const top = v(x0, y0) * (1 - tx) + v(x1, y0) * tx;
  const bot = v(x0, y1) * (1 - tx) + v(x1, y1) * tx;
  return top * (1 - ty) + bot * ty;
}

export interface ReprojectResult {
  rgba: Uint8Array;
  width: number;
  height: number;
}

/**
 * Reproject the south-up cropped reflectivity into a north-up, Web-Mercator-aligned
 * RGBA raster spanning geo.bbox. Output height preserves the Mercator aspect of the box
 * so the client can place it undistorted on the basemap. `outW` upsamples the 148-wide
 * crop (~4×) and the bilinear sampling smooths it — no blocky cells.
 */
export function reproject(crop: Int16Array, geo: GeoModel, outW = CROP_W * 4): ReprojectResult {
  const { west, east, south, north } = geo.bbox;
  const xW = lonToMercNorm(west);
  const xE = lonToMercNorm(east);
  const yN = latToMercNorm(north); // top
  const yS = latToMercNorm(south); // bottom
  const outH = Math.max(1, Math.round((outW * (yS - yN)) / (xE - xW)));
  const rgba = new Uint8Array(outW * outH * 4);

  for (let py = 0; py < outH; py++) {
    const lat = mercNormToLat(yN + ((yS - yN) * (py + 0.5)) / outH);
    for (let px = 0; px < outW; px++) {
      const lon = west + ((east - west) * (px + 0.5)) / outW; // Mercator x is linear in lon
      const { fx, fy } = lonLatToGrid(geo, lon, lat);
      const [r, g, b, a]: Rgba = dbzToRgba(sampleDbz(crop, fx - geo.crop.ix0, fy - geo.crop.iy0));
      const o = (py * outW + px) * 4;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = a;
    }
  }
  return { rgba, width: outW, height: outH };
}
