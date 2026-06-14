/**
 * The bridge between live data and pixels.
 *
 * Given a continuous {@link SunPhase} and the current weather, this produces a
 * flat bag of numeric visual parameters — colours (sRGB 0–1 tuples), light
 * intensities/direction, fog distances, cloud density, precipitation amounts,
 * a wind vector, exposure and post-fx hints. The 3D scene keeps a "live" copy
 * of this and lerps it toward the freshly-computed "target" every frame, so
 * both time-of-day drift and weather refreshes cross-fade smoothly instead of
 * snapping.
 *
 * Everything here is pure. No three.js, no React.
 */

import { aerosolFromAir } from "@/lib/airQuality";
import type { NormalizedAirQuality, WeatherCondition } from "@/lib/types";
import type { SunPhase } from "./seoulTime";

export type RGB = [number, number, number];

export interface SceneConfig {
  // Sky dome vertical gradient.
  skyTop: RGB;
  skyMid: RGB;
  skyHorizon: RGB;
  // Atmospheric fog (linear).
  fogColor: RGB;
  fogNear: number;
  fogFar: number;
  haze: number; // 0..1 extra horizon murk
  // Key light — the sun by day, the moon by night.
  lightColor: RGB;
  lightIntensity: number;
  /** Unit direction from the scene origin toward the light. */
  lightDir: [number, number, number];
  // Fill light.
  ambientColor: RGB;
  ambientIntensity: number;
  hemiSky: RGB;
  hemiGround: RGB;
  hemiIntensity: number;
  // Celestial glows / stars.
  sunGlowColor: RGB;
  sunGlow: number; // 0..1
  moonGlow: number; // 0..1
  starOpacity: number; // 0..1
  // Clouds.
  cloudLit: RGB; // light-facing colour
  cloudShadow: RGB; // base/shadow colour
  cloudCover: number; // 0..1 density
  cloudOpacity: number; // 0..1
  // Seoul, far below.
  cityGlow: RGB;
  cityLight: number; // 0..1 night windows
  cityVisibility: number; // 0..1 (fog/precip hide the city)
  // Precipitation.
  rain: number; // 0..1
  snow: number; // 0..1
  lightning: number; // 0 | 1
  // Image.
  exposure: number;
  bloom: number; // 0..1 post-fx hint
  vignette: number; // 0..1
  // Wind — horizontal world direction the air flows TOWARD (+x east, -z north).
  windVec: [number, number];
  windStrength: number; // 0..1 (already clamped to a safe range)
}

export interface SceneWeather {
  condition: WeatherCondition;
  cloudCover: number; // 0..100
  humidity: number; // 0..100
  windSpeed: number; // km/h
  windDirection: number; // deg the wind comes FROM
  precipitation: number; // mm
  precipitationProbability: number; // 0..100
  visibility: number | null; // metres
  temperature: number; // °C
  /** Particulate haze 0..1 (PM2.5/PM10/dust/AOD), clamped to a believable range. */
  aerosol: number;
  /** Korean AQI band 1–4 (PM-based) for honest copy; null when unknown. */
  airBand: 1 | 2 | 3 | 4 | null;
  /** UV index for subtle daytime glare; null when unknown. */
  uvIndex: number | null;
}

type CurrentLike = {
  condition: WeatherCondition;
  cloudCover: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  precipitation: number | null;
  precipitationProbability: number | null;
  visibility: number | null;
  temperature: number;
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const scale = (c: RGB, s: number): RGB => [c[0] * s, c[1] * s, c[2] * s];

const RAINY: WeatherCondition[] = ["drizzle", "rain", "heavy-rain", "thunderstorm", "sleet"];

/** Fill nulls with believable Seoul defaults so the scene never breaks. */
export function normalizeWeather(
  c?: CurrentLike | null,
  air?: NormalizedAirQuality | null,
): SceneWeather {
  return {
    condition: c?.condition ?? "clear",
    cloudCover: c?.cloudCover ?? (c ? 0 : 25),
    humidity: c?.humidity ?? 55,
    windSpeed: c?.windSpeed ?? 6,
    windDirection: c?.windDirection ?? 270,
    precipitation: c?.precipitation ?? 0,
    precipitationProbability: c?.precipitationProbability ?? 0,
    visibility: c?.visibility ?? null,
    temperature: c?.temperature ?? 12,
    aerosol: aerosolFromAir(air ?? null),
    airBand: air?.band ?? null,
    uvIndex: air?.uvIndex ?? null,
  };
}

// --- colour anchors (sRGB-ish 0..1) -----------------------------------------

const DAY = { top: [0.16, 0.41, 0.82] as RGB, mid: [0.34, 0.57, 0.86] as RGB, hor: [0.69, 0.81, 0.92] as RGB };
const NIGHT = { top: [0.008, 0.014, 0.05] as RGB, mid: [0.02, 0.035, 0.1] as RGB, hor: [0.05, 0.08, 0.19] as RGB };
const STORM_DAY = { top: [0.3, 0.33, 0.38] as RGB, mid: [0.42, 0.45, 0.49] as RGB, hor: [0.55, 0.57, 0.6] as RGB };
const STORM_NIGHT = { top: [0.02, 0.03, 0.05] as RGB, mid: [0.05, 0.06, 0.09] as RGB, hor: [0.09, 0.1, 0.14] as RGB };

const SUNRISE_WARM: RGB = [0.99, 0.62, 0.5];
const SUNSET_WARM: RGB = [0.99, 0.45, 0.24];

export function buildSceneConfig(sun: SunPhase, w: SceneWeather): SceneConfig {
  const { dayFactor, twilightFactor, goldenFactor, elevation, rising } = sun;
  const cover = clamp01(w.cloudCover / 100);
  const humid = clamp01(w.humidity / 100);
  const rainy = RAINY.includes(w.condition);
  const storm = w.condition === "thunderstorm";
  const foggy = w.condition === "fog";

  // How thick / grey the sky reads, independent of time.
  let overcast = cover;
  if (w.condition === "cloudy") overcast = Math.max(overcast, 0.65);
  if (w.condition === "overcast" || w.condition === "unknown") overcast = Math.max(overcast, 0.92);
  if (foggy) overcast = Math.max(overcast, 0.82);
  if (rainy) overcast = Math.max(overcast, 0.85);
  if (storm) overcast = Math.max(overcast, 0.96);
  const clearness = 1 - overcast;

  // The warm band picks orange (dusk) vs pink (dawn).
  const warm = mix(SUNRISE_WARM, SUNSET_WARM, rising ? 0 : 1);

  // 1. base clear-air sky from time of day
  let skyTop = mix(NIGHT.top, DAY.top, dayFactor);
  let skyMid = mix(NIGHT.mid, DAY.mid, dayFactor);
  let skyHorizon = mix(NIGHT.hor, DAY.hor, dayFactor);

  // 2. warm twilight + golden wash near the horizon
  const warmAmt = twilightFactor * 0.85 + goldenFactor * 0.3;
  skyHorizon = mix(skyHorizon, warm, clamp01(warmAmt) * 0.85);
  skyMid = mix(skyMid, warm, clamp01(warmAmt) * 0.32);
  skyTop = mix(skyTop, warm, clamp01(warmAmt) * 0.07);

  // 3. flatten toward storm grey as it clouds over
  const storm3 = {
    top: mix(STORM_NIGHT.top, STORM_DAY.top, dayFactor),
    mid: mix(STORM_NIGHT.mid, STORM_DAY.mid, dayFactor),
    hor: mix(STORM_NIGHT.hor, STORM_DAY.hor, dayFactor),
  };
  const greyAmt = clamp01(overcast * (storm ? 1 : foggy ? 0.85 : 0.78));
  skyTop = mix(skyTop, storm3.top, greyAmt);
  skyMid = mix(skyMid, storm3.mid, greyAmt);
  skyHorizon = mix(skyHorizon, storm3.hor, greyAmt * 0.8);

  // 4. temperature: cold air reads crisper/bluer, warm humid air softer/warmer
  if (w.temperature <= 2) {
    const cold = clamp01((2 - w.temperature) / 14) * 0.06;
    skyTop = mix(skyTop, [0.5, 0.62, 0.95], cold);
    skyHorizon = mix(skyHorizon, [0.6, 0.72, 0.95], cold);
  } else if (w.temperature >= 26 && humid > 0.55) {
    const muggy = clamp01((w.temperature - 26) / 12) * humid * 0.05;
    skyHorizon = mix(skyHorizon, [0.86, 0.82, 0.74], muggy);
  }

  // --- light -----------------------------------------------------------------
  // Sun azimuth: morning in the east (+x) and ahead, evening in the west (-x).
  const az = (rising ? 55 : -55) * (Math.PI / 180);
  const altRad = Math.max(elevation, -0.25) * (Math.PI / 2) * 0.92;
  let lightDir: [number, number, number] = [
    Math.sin(az) * Math.cos(altRad),
    Math.sin(altRad),
    -Math.cos(az) * Math.cos(altRad),
  ];

  let lightColor: RGB;
  let lightIntensity: number;
  if (dayFactor > 0.5) {
    // daytime sun, warming toward the horizon
    lightColor = mix([1.0, 0.97, 0.9], warm, twilightFactor * 0.7 + goldenFactor * 0.5);
    lightIntensity = (0.5 + dayFactor * 2.7) * (1 - overcast * 0.72) + goldenFactor * 0.4;
  } else {
    // moonlight — cool, soft, raked from above so cloud tops catch it
    lightColor = [0.62, 0.7, 0.86];
    lightIntensity = (0.12 + clearness * 0.5) * (0.4 + dayFactor);
    lightDir = [lightDir[0] * 0.5, Math.max(lightDir[1], 0.55), lightDir[2] * 0.5 - 0.2];
  }
  const dl = Math.hypot(...lightDir) || 1;
  lightDir = [lightDir[0] / dl, lightDir[1] / dl, lightDir[2] / dl];

  // --- fill ------------------------------------------------------------------
  const ambientColor = mix([0.16, 0.22, 0.4], [0.62, 0.72, 0.86], dayFactor);
  const ambientIntensity = lerp(0.22, 0.6, dayFactor) + overcast * 0.12;
  const hemiIntensity = lerp(0.18, 0.5, dayFactor) + overcast * 0.08;

  // --- atmosphere / fog ------------------------------------------------------
  // Particulate haze (PM2.5/PM10/dust/AOD) thins distant clarity and warms the
  // horizon murk — subtle and clamped, never a medical-grade severity signal.
  const aerosol = clamp01(w.aerosol);
  let clarity = 1 - overcast * 0.28 - humid * 0.22 - (rainy ? 0.28 : 0) - (w.condition === "snow" ? 0.22 : 0);
  clarity -= aerosol * 0.45;
  if (foggy) clarity = Math.min(clarity, 0.12);
  if (w.condition === "heavy-rain") clarity = Math.min(clarity, 0.3);
  if (w.visibility != null) clarity = Math.min(clarity, clamp(w.visibility / 30000, 0.07, 1));
  clarity = clamp01(clarity);
  const fogFar = lerp(150, 980, clarity);
  const fogNear = lerp(6, 70, clarity);
  // Humidity haze stays cool; dust/particulates pull it toward a warm gray.
  let fogColor = mix(skyHorizon, [0.5, 0.55, 0.62], 0.15 * overcast);
  fogColor = mix(fogColor, [0.62, 0.58, 0.52], aerosol * 0.5);
  const haze = clamp01(overcast * 0.5 + humid * 0.4 + (1 - clarity) * 0.5 + aerosol * 0.5);

  // --- celestial -------------------------------------------------------------
  const sunGlowColor = mix([1.0, 0.96, 0.85], warm, twilightFactor * 0.8 + goldenFactor * 0.5);
  const sunGlow = clamp01(dayFactor * 1.3) * clearness * (0.45 + twilightFactor * 0.55);
  const moonGlow = clamp01(1 - dayFactor * 1.5) * (0.4 + clearness * 0.6);
  const starOpacity = clamp01(1 - dayFactor * 1.25) * clearness * clearness;

  // --- clouds ----------------------------------------------------------------
  let cloudLit = mix([0.5, 0.55, 0.66], [1.0, 0.99, 0.97], dayFactor);
  let cloudShadow = mix([0.05, 0.07, 0.14], [0.5, 0.55, 0.66], dayFactor);
  cloudLit = mix(cloudLit, warm, clamp01(twilightFactor * 0.6 + goldenFactor * 0.45));
  const darken = clamp01(w.precipitation / 5) * 0.4 + (rainy ? 0.25 : 0) + (storm ? 0.3 : 0) + overcast * 0.18;
  cloudLit = mix(cloudLit, scale(cloudLit, 0.55), clamp01(darken));
  cloudShadow = mix(cloudShadow, scale(cloudShadow, 0.4), clamp01(darken));
  const cloudCover = clamp01(
    cover * 0.7 +
      (w.condition === "partly-cloudy" ? 0.35 : 0) +
      (w.condition === "cloudy" ? 0.6 : 0) +
      (w.condition === "overcast" || rainy ? 0.85 : 0) +
      (storm ? 0.95 : 0) +
      (foggy ? 0.5 : 0) +
      (w.condition === "clear" ? 0.12 : 0),
  );
  const cloudOpacity = clamp01(0.45 + overcast * 0.5 + humid * 0.1);

  // --- Seoul below -----------------------------------------------------------
  const cityGlow = mix([0.55, 0.6, 0.7], [1.0, 0.74, 0.42], clamp01(1 - dayFactor * 1.3));
  const cityLight = clamp01(1 - dayFactor * 1.4);
  const cityVisibility = clamp01(clarity * 1.1) * (foggy ? 0.4 : 1);

  // --- precipitation ---------------------------------------------------------
  const popScale = 0.7 + clamp01(w.precipitationProbability / 100) * 0.3;
  const precipPunch = 0.7 + clamp01(w.precipitation / 4) * 0.3;
  const rain =
    clamp01(
      (w.condition === "drizzle" ? 0.32 : 0) +
        (w.condition === "rain" ? 0.7 : 0) +
        (w.condition === "heavy-rain" ? 1 : 0) +
        (storm ? 0.85 : 0) +
        (w.condition === "sleet" ? 0.5 : 0),
    ) * popScale * precipPunch;
  const snow = clamp01(
    (w.condition === "snow" ? 0.75 : 0) + (w.condition === "sleet" ? 0.35 : 0),
  ) * precipPunch;
  const lightning = storm ? 1 : 0;

  // --- image -----------------------------------------------------------------
  // Dust slightly veils the sun; high UV adds a touch of daytime glare.
  const glare = clamp01((w.uvIndex ?? 0) / 9) * dayFactor;
  const exposure = clamp(
    1.0 + (1 - dayFactor) * 0.14 - overcast * 0.16 - (storm ? 0.08 : 0) - aerosol * 0.08 + glare * 0.06,
    0.72,
    1.22,
  );
  const bloom = clamp(0.55 + (1 - dayFactor) * 0.45 + goldenFactor * 0.35 - overcast * 0.2, 0.3, 1.35);
  const vignette = clamp01(0.42 + (storm ? 0.12 : 0) + (1 - dayFactor) * 0.1);

  // --- wind ------------------------------------------------------------------
  const toAz = ((w.windDirection + 180) % 360) * (Math.PI / 180); // direction air flows toward
  let windVec: [number, number] = [Math.sin(toAz), -Math.cos(toAz)];
  const wl = Math.hypot(windVec[0], windVec[1]) || 1;
  windVec = [windVec[0] / wl, windVec[1] / wl];
  const windStrength = clamp01(w.windSpeed / 45);

  return {
    skyTop,
    skyMid,
    skyHorizon,
    fogColor,
    fogNear,
    fogFar,
    haze,
    lightColor,
    lightIntensity,
    lightDir,
    ambientColor,
    ambientIntensity,
    hemiSky: skyHorizon,
    hemiGround: mix([0.04, 0.05, 0.08], [0.3, 0.28, 0.26], dayFactor),
    hemiIntensity,
    sunGlowColor,
    sunGlow,
    moonGlow,
    starOpacity,
    cloudLit,
    cloudShadow,
    cloudCover,
    cloudOpacity,
    cityGlow,
    cityLight,
    cityVisibility,
    rain,
    snow,
    lightning,
    exposure,
    bloom,
    vignette,
    windVec,
    windStrength,
  };
}

/** A safe starting config (clear, current clock-estimated time, no live data yet). */
export function initialSceneConfig(sun: SunPhase): SceneConfig {
  return buildSceneConfig(sun, normalizeWeather(null));
}

/**
 * Mutate `cur` toward `tgt` by factor `t` (0..1), in place — no allocation, so
 * it's safe to call every frame. Numbers lerp; RGB / vector tuples lerp
 * per-channel. This is what makes time-of-day drift and weather refreshes
 * cross-fade over several seconds instead of snapping.
 */
export function lerpSceneConfig(cur: SceneConfig, tgt: SceneConfig, t: number): void {
  const c = cur as unknown as Record<string, number | number[]>;
  const g = tgt as unknown as Record<string, number | number[]>;
  for (const k in g) {
    const a = c[k];
    const b = g[k];
    if (typeof a === "number" && typeof b === "number") {
      c[k] = a + (b - a) * t;
    } else if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < a.length; i++) a[i] = a[i] + (b[i] - a[i]) * t;
    }
  }
}

/** Deep copy so the "live" and "target" configs never share array references. */
export function cloneSceneConfig(c: SceneConfig): SceneConfig {
  return JSON.parse(JSON.stringify(c)) as SceneConfig;
}
