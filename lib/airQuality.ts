import type { NormalizedAirQuality } from "./types";

/**
 * Pure air-quality math, shared by the providers (band) and the cinematic mapper
 * (aerosol). No I/O — unit-tested in airQuality.test.ts.
 */

/**
 * Korean integrated air-quality band (통합대기환경지수, worse of PM2.5/PM10):
 *   1 좋음 · 2 보통 · 3 나쁨 · 4 매우나쁨 · null when both unknown.
 * PM2.5 µg/m³: ≤15 ≤35 ≤75 else · PM10 µg/m³: ≤30 ≤80 ≤150 else.
 */
export function koreanAqiBand(
  pm25: number | null,
  pm10: number | null,
): 1 | 2 | 3 | 4 | null {
  const b25 = pm25 == null ? 0 : pm25 <= 15 ? 1 : pm25 <= 35 ? 2 : pm25 <= 75 ? 3 : 4;
  const b10 = pm10 == null ? 0 : pm10 <= 30 ? 1 : pm10 <= 80 ? 2 : pm10 <= 150 ? 3 : 4;
  const band = Math.max(b25, b10);
  return band === 0 ? null : (band as 1 | 2 | 3 | 4);
}

/**
 * Atmospheric "thickness" 0..1 from particulates, for *subtle* scene haze only.
 * Takes the worst available signal (PM2.5 / PM10 / dust / AOD) and clamps it to
 * a believable range — clean air ≈ 0, heavy 황사 ≈ 1. Never used for medical copy.
 */
export function aerosolFromAir(air: NormalizedAirQuality | null): number {
  if (!air) return 0;
  const signals: number[] = [];
  if (air.pm25 != null) signals.push(air.pm25 / 110); // ~110 µg/m³ → full
  if (air.pm10 != null) signals.push(air.pm10 / 180); // ~180 µg/m³ → full (황사)
  if (air.dust != null) signals.push(air.dust / 250);
  if (air.aerosolOpticalDepth != null) signals.push(air.aerosolOpticalDepth / 1.5);
  if (signals.length === 0) return 0;
  return Math.max(0, Math.min(1, Math.max(...signals)));
}
