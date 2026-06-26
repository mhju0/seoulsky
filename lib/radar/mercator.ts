/**
 * Web Mercator (slippy-map / EPSG:3857) helpers — pure and safe on both client and
 * server (no Node/DOM globals). The server reprojects the Lambert radar grid into a
 * Mercator-aligned PNG using the normalized forms; the client places that PNG and lays
 * out CARTO tiles using the world-pixel forms at the basemap zoom. Sharing one
 * projection on both sides is what makes the echo register on the basemap exactly.
 */

export const TILE_SIZE = 256;

/** Longitude → normalized x ∈ [0,1] across the world (linear in lon). */
export function lonToMercNorm(lon: number): number {
  return (lon + 180) / 360;
}

/** Latitude → normalized y ∈ [0,1] (0 = north pole-ish, 1 = south); not linear in lat. */
export function latToMercNorm(lat: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const s = Math.sin((clamped * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

/** Inverse of {@link latToMercNorm}: normalized y → latitude. */
export function mercNormToLat(y: number): number {
  const n = Math.PI - 2 * Math.PI * y;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** World pixel X at a given integer/fractional zoom. */
export function lonToWorldX(lon: number, z: number): number {
  return lonToMercNorm(lon) * TILE_SIZE * 2 ** z;
}

/** World pixel Y at a given integer/fractional zoom. */
export function latToWorldY(lat: number, z: number): number {
  return latToMercNorm(lat) * TILE_SIZE * 2 ** z;
}
