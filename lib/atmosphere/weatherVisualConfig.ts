/**
 * ATMOSPHERIC COLOR FIELD — live-data → visual-parameter normalization.
 *
 * The analogue of `weatherSceneConfig` for this page: it takes a {@link SunPhase}
 * + a {@link SkySnapshot} and produces a flat bag of CLAMPED visual parameters
 * for the fullscreen atmospheric shader. Raw API numbers never reach the shader —
 * they are all bounded to visually-safe ranges here first.
 *
 * Everything is PURE (no WebGL, no React). The view keeps a "live" copy and
 * lerps it toward a fresh "target" every frame, so weather refreshes and
 * time-of-day drift cross-fade smoothly instead of snapping.
 */

import { aerosolFromAir } from "../airQuality.ts";
import { CONDITION_LABELS_KO } from "../conditions.ts";
import { windDirectionKo } from "../format.ts";
import type { SunPhase } from "../cinematic/seoulTime.ts";
import type { SkySnapshot, WeatherCondition } from "../types.ts";
import { buildSkyPalette, mix, type RGB } from "./weatherPalette.ts";

export type { RGB } from "./weatherPalette.ts";

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const RAINY: WeatherCondition[] = ["drizzle", "rain", "heavy-rain", "thunderstorm", "sleet"];
const SNOWY: WeatherCondition[] = ["snow", "sleet"];

/** Absolute Seoul temperature envelope used for warm/cool balance. */
const TEMP_MIN = -14;
const TEMP_MAX = 37;

// Weather-driven accent (the single highlight colour for scrim edges / UI ticks).
const ACCENTS: Record<string, RGB> = {
  paleCyan: [0.46, 0.83, 0.95],
  electricBlue: [0.4, 0.56, 0.82],
  amber: [1.0, 0.63, 0.27],
  whiteBlue: [0.73, 0.86, 1.0],
  warmOrange: [1.0, 0.48, 0.18],
  cobalt: [0.5, 0.55, 0.98],
  steel: [0.6, 0.68, 0.79],
};

function pickAccent(condition: WeatherCondition, sun: SunPhase, temp: number): { rgb: RGB; name: string } {
  const twilight = sun.twilightFactor > 0.45 || sun.goldenFactor > 0.32;
  if (SNOWY.includes(condition)) return { rgb: [...ACCENTS.whiteBlue] as RGB, name: "COLD WHITE" };
  if (RAINY.includes(condition)) return { rgb: [...ACCENTS.electricBlue] as RGB, name: "ELECTRIC BLUE" };
  if (condition === "fog") return { rgb: [...ACCENTS.steel] as RGB, name: "STEEL" };
  if (twilight) return { rgb: [...ACCENTS.amber] as RGB, name: "AMBER" };
  if (condition === "overcast" || condition === "cloudy") return { rgb: [...ACCENTS.steel] as RGB, name: "STEEL" };
  if (sun.isDay) {
    return temp >= 30
      ? { rgb: [...ACCENTS.warmOrange] as RGB, name: "WARM ORANGE" }
      : { rgb: [...ACCENTS.paleCyan] as RGB, name: "PALE CYAN" };
  }
  return { rgb: [...ACCENTS.cobalt] as RGB, name: "DEEP COBALT" };
}

export interface VisualConfig {
  // palette (all lerped)
  skyTop: RGB;
  skyHorizon: RGB;
  skyBottom: RGB;
  sunColor: RGB;
  sunPos: [number, number];
  sunIntensity: number;
  horizonY: number;
  accent: RGB;

  // dynamics (all clamped 0..1 unless noted)
  skyWarmth: number; // warm↔cool tint balance
  hazeDensity: number; // fog / humidity / aerosol thickness
  cloudShadowStrength: number; // size+darkness of drifting cloud shadows
  windDir: [number, number]; // unit screen-space drift direction (flow TO)
  windDriftSpeed: number; // 0..1
  gust: number; // 0..1 short turbulence
  rainDistortion: number; // 0..1 wet-glass vertical warp
  snowDensity: number; // 0..1 slow bright particles
  lightDiffusion: number; // 0..1 sun-glow spread
  backgroundContrast: number; // 0..1 depth / sharpness
  grain: number; // film grain amount

  // discrete (copied, not lerped)
  accentName: string;
  precipType: "rain" | "snow" | "none";
}

/** A safe spring-Seoul default so the field is never blank or broken. */
const FALLBACK = {
  condition: "partly-cloudy" as WeatherCondition,
  cloudCover: 35,
  humidity: 55,
  windSpeed: 9,
  windGusts: null as number | null,
  windDirection: 290,
  precipitation: 0,
  precipitationProbability: 0,
  visibility: 14000 as number | null,
  temperature: 17,
  apparentTemperature: null as number | null,
};

/** Mix every sky stop toward a target colour by `t` (used by weather modifiers). */
function tintStops(p: { skyTop: RGB; skyHorizon: RGB; skyBottom: RGB }, target: RGB, t: number) {
  p.skyTop = mix(p.skyTop, target, t);
  p.skyHorizon = mix(p.skyHorizon, target, t);
  p.skyBottom = mix(p.skyBottom, target, t);
}

/**
 * Build the full clamped visual config from a sun phase + a live snapshot.
 * Missing fields fall back to believable Seoul values so a partial payload still
 * yields a complete, beautiful field.
 */
export function buildVisualConfig(sun: SunPhase, snapshot: SkySnapshot | null): VisualConfig {
  const c = snapshot?.current;
  const condition = c?.condition ?? FALLBACK.condition;
  const cloudCover = c?.cloudCover ?? FALLBACK.cloudCover;
  const humidity = c?.humidity ?? FALLBACK.humidity;
  const windSpeed = c?.windSpeed ?? FALLBACK.windSpeed;
  const windGusts = c?.windGusts ?? FALLBACK.windGusts;
  const windDirection = c?.windDirection ?? FALLBACK.windDirection;
  const precipitation = c?.precipitation ?? FALLBACK.precipitation;
  const pop = c?.precipitationProbability ?? FALLBACK.precipitationProbability;
  const visibility = c?.visibility ?? FALLBACK.visibility;
  const temperature = c?.temperature ?? FALLBACK.temperature;
  const apparent = c?.apparentTemperature ?? FALLBACK.apparentTemperature;
  const aerosol = clamp01(aerosolFromAir(snapshot?.air ?? null));

  const rainy = RAINY.includes(condition);
  const snowy = SNOWY.includes(condition);
  const storm = condition === "thunderstorm";
  const foggy = condition === "fog";
  const overcast = condition === "overcast";
  const cloudy = condition === "cloudy";

  const palette = buildSkyPalette(sun);
  const sky = {
    skyTop: palette.skyTop,
    skyHorizon: palette.skyHorizon,
    skyBottom: palette.skyBottom,
  };

  // --- weather colour modifiers (fold weather into the time-of-day palette) ---
  const cover = clamp01(cloudCover / 100);
  if (cloudy || overcast) tintStops(sky, [0.46, 0.5, 0.56], (cloudy ? 0.22 : 0.42) * (0.6 + cover * 0.4));
  if (rainy) tintStops(sky, [0.3, 0.36, 0.46], storm ? 0.5 : 0.34);
  if (snowy) tintStops(sky, [0.82, 0.85, 0.92], 0.3);
  if (foggy) tintStops(sky, [0.66, 0.69, 0.73], 0.45);
  if (aerosol > 0.05) tintStops(sky, [0.55, 0.47, 0.39], aerosol * 0.34); // sepia 황사 haze

  // --- dynamics -------------------------------------------------------------
  const thermal = clamp01((temperature - TEMP_MIN) / (TEMP_MAX - TEMP_MIN));
  const skyWarmth = clamp01(thermal * 0.7 + sun.goldenFactor * 0.5);

  const humid = clamp01(humidity / 100);
  const lowVis = visibility != null ? clamp01(1 - visibility / 20000) : 0;
  const hazeDensity = clamp01(
    (foggy ? 0.72 : 0) + humid * 0.35 + aerosol * 0.5 + lowVis * 0.4 + (rainy ? 0.18 : 0),
  );

  const cloudShadowStrength = clamp01(
    cover * 0.65 +
      (cloudy ? 0.2 : 0) +
      (overcast ? 0.3 : 0) +
      (rainy ? 0.25 : 0) +
      (storm ? 0.35 : 0) +
      (condition === "partly-cloudy" ? 0.12 : 0),
  );

  // Wind FROM `windDirection` flows TO the opposite bearing; map to screen
  // (x → east/right, y → north/up).
  const toAz = (((windDirection + 180) % 360) * Math.PI) / 180;
  let windDir: [number, number] = [Math.sin(toAz), -Math.cos(toAz)];
  const wl = Math.hypot(windDir[0], windDir[1]) || 1;
  windDir = [windDir[0] / wl, windDir[1] / wl];
  const windDriftSpeed = clamp01(windSpeed / 40);
  const gust =
    windGusts != null && windGusts > windSpeed
      ? clamp01((windGusts - windSpeed) / 22)
      : clamp01(windDriftSpeed * 0.3);

  const precipType: VisualConfig["precipType"] = snowy ? "snow" : rainy ? "rain" : "none";
  const rainBase =
    condition === "drizzle" ? 0.32
      : condition === "rain" ? 0.62
      : condition === "heavy-rain" ? 1
      : storm ? 0.82
      : condition === "sleet" ? 0.5
      : 0;
  const rainDistortion =
    precipType === "rain"
      ? clamp01(rainBase * (0.65 + clamp01(pop / 100) * 0.35) * (0.75 + clamp01(precipitation / 4) * 0.25))
      : 0;
  const snowDensity =
    precipType === "snow"
      ? clamp01((condition === "snow" ? 0.7 : 0.45) * (0.7 + clamp01(pop / 100) * 0.3))
      : 0;

  // Cloud / precip / fog dim the sun so overcast & rainy skies don't blaze.
  const occlusion = clamp01(
    cover * 0.55 +
      (cloudy ? 0.3 : 0) +
      (overcast ? 0.5 : 0) +
      (rainy ? 0.55 : 0) +
      (storm ? 0.25 : 0) +
      (foggy ? 0.6 : 0),
  );
  const sunIntensity = clamp01(palette.sunIntensity * (1 - occlusion * 0.82));

  const apparentWarm = apparent == null ? 0 : clamp((apparent - temperature) / 8, -1, 1);
  const lightDiffusion = clamp01(0.34 + sunIntensity * 0.28 + humid * 0.18 + Math.max(apparentWarm, 0) * 0.2);
  const backgroundContrast = clamp01(0.55 + (1 - lowVis) * 0.3 - hazeDensity * 0.3 - aerosol * 0.15);
  const grain = clamp01(0.05 + (1 - sun.dayFactor) * 0.035);

  const accentPick = pickAccent(condition, sun, temperature);

  return {
    skyTop: sky.skyTop,
    skyHorizon: sky.skyHorizon,
    skyBottom: sky.skyBottom,
    sunColor: palette.sunColor,
    sunPos: palette.sunPos,
    sunIntensity,
    horizonY: palette.horizonY,
    accent: accentPick.rgb,
    skyWarmth,
    hazeDensity,
    cloudShadowStrength,
    windDir,
    windDriftSpeed,
    gust,
    rainDistortion,
    snowDensity,
    lightDiffusion,
    backgroundContrast,
    grain,
    accentName: accentPick.name,
    precipType,
  };
}

/** Mutate `cur` toward `tgt` by factor `t` in place — numbers + number[] only, no allocation. */
export function lerpVisualConfig(cur: VisualConfig, tgt: VisualConfig, t: number): void {
  const c = cur as unknown as Record<string, number | number[] | string>;
  const g = tgt as unknown as Record<string, number | number[] | string>;
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

/** Copy the discrete (non-interpolated) fields immediately when the target changes. */
export function copyDiscrete(cur: VisualConfig, tgt: VisualConfig): void {
  cur.accentName = tgt.accentName;
  cur.precipType = tgt.precipType;
}

/** Deep copy so "live" and "target" never share array references. */
export function cloneVisualConfig(c: VisualConfig): VisualConfig {
  return {
    ...c,
    skyTop: [...c.skyTop] as RGB,
    skyHorizon: [...c.skyHorizon] as RGB,
    skyBottom: [...c.skyBottom] as RGB,
    sunColor: [...c.sunColor] as RGB,
    sunPos: [...c.sunPos] as [number, number],
    accent: [...c.accent] as RGB,
    windDir: [...c.windDir] as [number, number],
  };
}

export { lerp };

// --- DOM readout (safe display values for the typography overlays) ----------

export interface AtmosphereReadout {
  hasData: boolean;
  temperature: number | null;
  apparentTemperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windDirectionKo: string;
  precipitationProbability: number | null;
  visibility: number | null;
  condition: WeatherCondition;
  conditionKo: string;
  airBand: 1 | 2 | 3 | 4 | null;
  /** Representative particulate value (PM2.5 → PM10), for the air-quality metric. */
  airValue: number | null;
  uvIndex: number | null;
}

/** Pull display-ready, null-safe values out of a snapshot for the HTML layers. */
export function readAtmosphere(snapshot: SkySnapshot | null): AtmosphereReadout {
  const c = snapshot?.current;
  const air = snapshot?.air ?? null;
  return {
    hasData: !!c,
    temperature: c?.temperature ?? null,
    apparentTemperature: c?.apparentTemperature ?? null,
    humidity: c?.humidity ?? null,
    windSpeed: c?.windSpeed ?? null,
    windDirection: c?.windDirection ?? null,
    windDirectionKo: windDirectionKo(c?.windDirection ?? null),
    precipitationProbability: c?.precipitationProbability ?? null,
    visibility: c?.visibility ?? null,
    condition: c?.condition ?? "unknown",
    conditionKo: CONDITION_LABELS_KO[c?.condition ?? "unknown"],
    airBand: air?.band ?? null,
    airValue: air?.pm25 ?? air?.pm10 ?? null,
    uvIndex: air?.uvIndex ?? null,
  };
}

const CONDITION_LABELS_EN: Record<WeatherCondition, string> = {
  clear: "CLEAR",
  "partly-cloudy": "PARTLY CLOUDY",
  cloudy: "CLOUDY",
  overcast: "OVERCAST",
  fog: "FOG",
  drizzle: "DRIZZLE",
  rain: "RAIN",
  "heavy-rain": "HEAVY RAIN",
  snow: "SNOW",
  sleet: "SLEET",
  thunderstorm: "THUNDERSTORM",
  unknown: "—",
};

export function conditionLabelEn(condition: WeatherCondition): string {
  return CONDITION_LABELS_EN[condition];
}

const AIR_BAND_EN = ["", "GOOD", "MODERATE", "POOR", "VERY POOR"] as const;
export function airBandLabelEn(band: 1 | 2 | 3 | 4 | null): string | null {
  return band == null ? null : AIR_BAND_EN[band];
}

/** WHO UV-index exposure band, used as the small descriptor on the UV metric. */
export function uvBandLabelEn(uv: number | null): string | null {
  if (uv == null) return null;
  if (uv < 3) return "LOW";
  if (uv < 6) return "MODERATE";
  if (uv < 8) return "HIGH";
  if (uv < 11) return "VERY HIGH";
  return "EXTREME";
}
