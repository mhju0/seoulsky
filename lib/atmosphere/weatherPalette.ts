/**
 * ATMOSPHERIC COLOR FIELD — time-of-day palette.
 *
 * Pure colour maths: a {@link SunPhase} becomes a three-stop vertical sky
 * gradient (zenith / horizon band / ground), a sun-glow colour + intensity +
 * screen position, and the vertical position of the bright horizon band. No
 * weather is folded in here — that's {@link buildVisualConfig}'s job; this file
 * only answers "what colour is the Seoul sky right now, by the clock".
 *
 * Colours are display-sRGB 0..1 and are written straight to the default
 * framebuffer (no tone mapping), so they read exactly like CSS gradient stops.
 */

import type { SunPhase } from "../cinematic/seoulTime.ts";

export type RGB = [number, number, number];

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

interface SkyStops {
  top: RGB; // zenith
  horizon: RGB; // bright band
  bottom: RGB; // ground haze
}

// Anchor palettes blended by the continuous sun phase.
const DAY: SkyStops = {
  top: [0.18, 0.42, 0.78],
  horizon: [0.62, 0.79, 0.93],
  bottom: [0.78, 0.85, 0.92],
};
const NIGHT: SkyStops = {
  top: [0.015, 0.03, 0.085],
  horizon: [0.05, 0.08, 0.17],
  bottom: [0.03, 0.05, 0.12],
};
// Warm twilight (sunrise / sunset) — indigo zenith, amber band, dusky ground.
const TWILIGHT: SkyStops = {
  top: [0.14, 0.16, 0.40],
  horizon: [0.99, 0.55, 0.30],
  bottom: [0.50, 0.27, 0.40],
};

export interface SkyPalette {
  skyTop: RGB;
  skyHorizon: RGB;
  skyBottom: RGB;
  sunColor: RGB;
  /** 0..1 overall light strength of the sun/moon glow. */
  sunIntensity: number;
  /** Screen-space glow centre, x,y in 0..1 (y up). */
  sunPos: [number, number];
  /** Vertical position 0..1 (y up) of the bright horizon band. */
  horizonY: number;
}

/**
 * Build the by-the-clock sky palette from a sun phase. Continuous: pre-dawn →
 * sunrise → day → sunset → night all cross-fade rather than snap.
 */
export function buildSkyPalette(sun: SunPhase): SkyPalette {
  const day = clamp01(sun.dayFactor);
  // Warm-band weight: peaks right at the horizon (twilight) and through golden hour.
  const tw = clamp01(sun.twilightFactor * 0.9 + sun.goldenFactor * 0.7);

  // night → day, then pull toward the warm twilight stops near the horizon.
  const base = (a: keyof SkyStops, w: number): RGB =>
    mix(mix(NIGHT[a], DAY[a], day), TWILIGHT[a], clamp01(tw * w));

  const skyTop = base("top", 0.55);
  const skyHorizon = base("horizon", 1.0);
  const skyBottom = base("bottom", 0.7);

  // Sun colour: warm amber at twilight, near-white by day, cool moonlight at night.
  const sunColor = mix(
    mix([0.55, 0.66, 0.86], [1.0, 0.97, 0.9], day), // moon → daylight
    [1.0, 0.62, 0.32], // amber
    tw,
  );
  const sunIntensity = clamp01(0.18 + day * 0.5 + sun.goldenFactor * 0.45);

  // Keep the primary light in the RIGHT THIRD at all times: the left ~third is
  // the protected typography zone, and the reference art keeps the event to the
  // right. Morning leans toward centre-right, evening pushes further right.
  const sx = sun.rising ? 0.66 : 0.76;
  // A lower horizon gives more sky and a more dramatic field.
  const horizonY = clamp01(0.26 + day * 0.12 + sun.goldenFactor * 0.04);
  const sy = clamp01(horizonY + 0.06 + Math.max(sun.elevation, -0.2) * 0.24);

  return { skyTop, skyHorizon, skyBottom, sunColor, sunIntensity, sunPos: [sx, sy], horizonY };
}
