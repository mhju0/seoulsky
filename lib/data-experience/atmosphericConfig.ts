/**
 * SEOUL ATMOSPHERIC CORE — live-data → visual-parameter normalization.
 *
 * This is the data-experience analogue of `weatherSceneConfig` for the cinematic
 * homepage, but it serves a different scene: a single instrument-like core whose
 * material, glow, particles and orbit are driven by Seoul's live atmosphere.
 *
 * Everything here is PURE — no three.js, no React. It takes a {@link SunPhase}
 * and a {@link SkySnapshot} and produces a flat bag of CLAMPED numeric visual
 * parameters. The scene keeps a "live" copy of this and lerps it toward a fresh
 * "target" every frame, so weather refreshes and time-of-day drift cross-fade
 * smoothly instead of snapping. Raw API values never touch three.js directly:
 * they are all bounded to visually-safe ranges here first.
 */

import { aerosolFromAir } from "../airQuality.ts";
import { CONDITION_LABELS_KO } from "../conditions.ts";
import { windDirectionKo } from "../format.ts";
import type { SunPhase } from "../cinematic/seoulTime.ts";
import type { HourlyForecast, SkySnapshot, WeatherCondition } from "../types.ts";

export type RGB = [number, number, number];

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const RAINY: WeatherCondition[] = ["drizzle", "rain", "heavy-rain", "thunderstorm", "sleet"];
const SNOWY: WeatherCondition[] = ["snow", "sleet"];

/** Absolute Seoul temperature envelope used for absolute thermal colour. */
const TEMP_MIN = -14;
const TEMP_MAX = 37;

// --- accent palette (sRGB-ish 0..1, applied with SRGBColorSpace in-scene) ----

const ACCENTS = {
  paleCyan: { rgb: [0.46, 0.83, 0.95] as RGB, name: "PALE CYAN" },
  electricBlue: { rgb: [0.4, 0.56, 0.82] as RGB, name: "ELECTRIC BLUE" },
  amber: { rgb: [1.0, 0.63, 0.27] as RGB, name: "AMBER" },
  whiteBlue: { rgb: [0.73, 0.86, 1.0] as RGB, name: "COLD WHITE-BLUE" },
  warmOrange: { rgb: [1.0, 0.48, 0.18] as RGB, name: "WARM ORANGE" },
  cobalt: { rgb: [0.44, 0.48, 0.96] as RGB, name: "DEEP COBALT" },
  steel: { rgb: [0.6, 0.68, 0.79] as RGB, name: "STEEL GREY" },
} as const;

const THERMAL_COLD: RGB = [0.45, 0.66, 1.0];
const THERMAL_HOT: RGB = [1.0, 0.42, 0.18];

/**
 * The one weather-driven accent. Condition leads (rain/snow/fog are
 * unmistakable), then a strong twilight wins (sunset → amber), then heat, then
 * the time-of-day mood. Returns a copy so callers can't mutate the palette.
 */
function pickAccent(condition: WeatherCondition, sun: SunPhase, temp: number) {
  let a: { rgb: RGB; name: string };
  const twilight = sun.twilightFactor > 0.45 || sun.goldenFactor > 0.32;
  if (SNOWY.includes(condition)) a = ACCENTS.whiteBlue;
  else if (RAINY.includes(condition)) a = ACCENTS.electricBlue;
  else if (condition === "fog") a = ACCENTS.steel;
  else if (twilight) a = ACCENTS.amber;
  else if (condition === "overcast") a = ACCENTS.steel;
  else if (sun.isDay) a = temp >= 30 ? ACCENTS.warmOrange : ACCENTS.paleCyan;
  else a = ACCENTS.cobalt;
  return { rgb: [...a.rgb] as RGB, name: a.name };
}

export interface AtmosphericConfig {
  // accent (the single weather colour)
  accent: RGB;
  accentName: string; // not lerped — copied discretely
  accentIntensity: number; // 0..1 rim / glow strength

  // central instrument body
  coreGlow: number; // 0..1 inner light strength
  thermalIntensity: number; // 0..1 absolute warmth
  thermalColor: RGB; // cold-blue → hot-orange
  thermalExpansion: number; // ~0.84..1.18 inner-sphere scale
  apparentDelta: number; // -1..1 (felt warmer/cooler than measured)

  // glass shell
  shellOpacity: number; // 0..1
  shellTint: RGB;

  // suspended water
  cloudDensity: number; // 0..1 internal cloud volume
  fogDensity: number; // 0..1 internal fog
  condensation: number; // 0..1 droplets on the glass
  precipDensity: number; // 0..1
  precipType: "rain" | "snow" | "none"; // not lerped — copied discretely

  // air movement
  windSpeedNorm: number; // 0..1
  windVec: [number, number]; // unit, flow direction (x east, y north) in the orbit plane
  windDirDeg: number; // degrees the wind comes FROM
  gustNorm: number; // 0..1 turbulence

  // orbit
  orbitRadius: number; // base world radius for the forecast orbit
}

/** A safe interior-Seoul default so the scene is never blank or broken. */
const FALLBACK = {
  condition: "clear" as WeatherCondition,
  cloudCover: 18,
  humidity: 52,
  windSpeed: 7,
  windGusts: null as number | null,
  windDirection: 270,
  precipitation: 0,
  precipitationProbability: 0,
  visibility: null as number | null,
  temperature: 14,
  apparentTemperature: null as number | null,
};

/**
 * Build the full clamped visual config from a sun phase + a live snapshot.
 * Missing fields fall back to believable Seoul values so a partial payload
 * (no gusts, no pop, no cloud cover, …) still yields a complete scene.
 */
export function buildAtmosphericConfig(sun: SunPhase, snapshot: SkySnapshot | null): AtmosphericConfig {
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

  // --- accent ---------------------------------------------------------------
  const accentPick = pickAccent(condition, sun, temperature);
  const accentIntensity = clamp(
    0.5 + (sun.isDay ? 0.14 : 0.04) + (rainy ? 0.12 : 0) + (storm ? 0.22 : 0) + sun.goldenFactor * 0.1,
    0.3,
    1,
  );

  // --- thermal --------------------------------------------------------------
  const thermalIntensity = clamp01((temperature - TEMP_MIN) / (TEMP_MAX - TEMP_MIN));
  const thermalColor = mix(THERMAL_COLD, THERMAL_HOT, thermalIntensity);
  const thermalExpansion = lerp(0.84, 1.18, thermalIntensity);
  const apparentDelta = apparent == null ? 0 : clamp((apparent - temperature) / 8, -1, 1);

  // --- clouds / fog / condensation -----------------------------------------
  const cover = clamp01(cloudCover / 100);
  const cloudDensity = clamp01(
    cover * 0.8 +
      (condition === "partly-cloudy" ? 0.18 : 0) +
      (condition === "cloudy" ? 0.34 : 0) +
      (overcast || rainy ? 0.6 : 0) +
      (storm ? 0.8 : 0) +
      (foggy ? 0.42 : 0),
  );
  const humid = clamp01(humidity / 100);
  const lowVis = visibility != null ? clamp01(1 - visibility / 20000) * 0.4 : 0;
  const fogDensity = clamp01((foggy ? 0.75 : 0) + humid * 0.38 + (rainy ? 0.18 : 0) + aerosol * 0.3 + lowVis);
  const condensation = clamp01((humidity - 35) / 65);

  // --- precipitation --------------------------------------------------------
  const precipType: AtmosphericConfig["precipType"] = snowy ? "snow" : rainy ? "rain" : "none";
  const base =
    condition === "drizzle"
      ? 0.3
      : condition === "rain"
        ? 0.66
        : condition === "heavy-rain"
          ? 1
          : storm
            ? 0.85
            : condition === "sleet"
              ? 0.5
              : condition === "snow"
                ? 0.7
                : 0;
  const precipDensity =
    precipType === "none"
      ? 0
      : clamp01(base * (0.6 + clamp01(pop / 100) * 0.4) * (0.72 + clamp01(precipitation / 4) * 0.28));

  // --- wind -----------------------------------------------------------------
  const windSpeedNorm = clamp01(windSpeed / 45);
  const toAz = (((windDirection + 180) % 360) * Math.PI) / 180; // direction air flows toward
  let windVec: [number, number] = [Math.sin(toAz), Math.cos(toAz)];
  const wl = Math.hypot(windVec[0], windVec[1]) || 1;
  windVec = [windVec[0] / wl, windVec[1] / wl];
  const gustNorm =
    windGusts != null && windGusts > windSpeed
      ? clamp01((windGusts - windSpeed) / 22)
      : clamp01(windSpeedNorm * 0.35);

  // --- shell ----------------------------------------------------------------
  const shellOpacity = clamp(0.16 + humid * 0.22 + cloudDensity * 0.12 + fogDensity * 0.1, 0.12, 0.56);
  const shellTint = mix([0.62, 0.72, 0.86], accentPick.rgb, 0.42);

  // --- core glow ------------------------------------------------------------
  const coreGlow = clamp(0.42 + thermalIntensity * 0.28 + (1 - cloudDensity) * 0.22 + (storm ? 0.15 : 0), 0.25, 1);

  return {
    accent: accentPick.rgb,
    accentName: accentPick.name,
    accentIntensity,
    coreGlow,
    thermalIntensity,
    thermalColor,
    thermalExpansion,
    apparentDelta,
    shellOpacity,
    shellTint,
    cloudDensity,
    fogDensity,
    condensation,
    precipDensity,
    precipType,
    windSpeedNorm,
    windVec,
    windDirDeg: ((windDirection % 360) + 360) % 360,
    orbitRadius: 3.05,
    gustNorm,
  };
}

/** Mutate `cur` toward `tgt` by factor `t` in place — numbers + RGB tuples only, no allocation. */
export function lerpAtmosphericConfig(cur: AtmosphericConfig, tgt: AtmosphericConfig, t: number): void {
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
export function copyDiscreteAtmosphere(cur: AtmosphericConfig, tgt: AtmosphericConfig): void {
  cur.accentName = tgt.accentName;
  cur.precipType = tgt.precipType;
}

/** Deep copy so "live" and "target" never share array references. */
export function cloneAtmosphericConfig(c: AtmosphericConfig): AtmosphericConfig {
  return {
    ...c,
    accent: [...c.accent] as RGB,
    thermalColor: [...c.thermalColor] as RGB,
    shellTint: [...c.shellTint] as RGB,
    windVec: [...c.windVec] as [number, number],
  };
}

// --- DOM readout (safe display values for the typography overlays) ----------

export interface AtmosphericReadout {
  hasData: boolean;
  temperature: number | null;
  apparentTemperature: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windGusts: number | null;
  windDirection: number | null;
  windDirectionKo: string;
  cloudCover: number | null;
  precipitationProbability: number | null;
  rain: number | null;
  snowfall: number | null;
  visibility: number | null;
  condition: WeatherCondition;
  conditionKo: string;
  observedAt: string | null;
}

/** Pull display-ready, null-safe values out of a snapshot for the HTML layers. */
export function readAtmosphere(snapshot: SkySnapshot | null): AtmosphericReadout {
  const c = snapshot?.current;
  return {
    hasData: !!c,
    temperature: c?.temperature ?? null,
    apparentTemperature: c?.apparentTemperature ?? null,
    humidity: c?.humidity ?? null,
    windSpeed: c?.windSpeed ?? null,
    windGusts: c?.windGusts ?? null,
    windDirection: c?.windDirection ?? null,
    windDirectionKo: windDirectionKo(c?.windDirection ?? null),
    cloudCover: c?.cloudCover ?? null,
    precipitationProbability: c?.precipitationProbability ?? null,
    rain: c?.rain ?? null,
    snowfall: c?.snowfall ?? null,
    visibility: c?.visibility ?? null,
    condition: c?.condition ?? "unknown",
    conditionKo: CONDITION_LABELS_KO[c?.condition ?? "unknown"],
    observedAt: snapshot?.observedAt ?? null,
  };
}

// --- hourly → orbital points ------------------------------------------------

export interface HourPoint {
  iso: string;
  temperature: number;
  /** 0..1 across the absolute Seoul envelope — drives colour. */
  tempAbs: number;
  /** 0..1 within this window's own min/max — drives radius variation. */
  tempRel: number;
  precipProbability: number; // 0..100 (0 when unknown)
  condition: WeatherCondition;
  isPrecip: boolean;
  isNow: boolean;
}

const PRECIP_CONDITIONS: WeatherCondition[] = [...RAINY, "snow"];

/**
 * Enrich the first `count` hourly entries into orbital points. The provider's
 * slice already starts at the current hour, so index 0 is "now". Returns [] when
 * there's no hourly data (callers render a clean empty orbit, never a broken one).
 */
export function buildHourPoints(hourly: HourlyForecast[] | undefined, count: number): HourPoint[] {
  if (!hourly || hourly.length === 0) return [];
  const window = hourly.slice(0, count);
  let min = Infinity;
  let max = -Infinity;
  for (const h of window) {
    if (h.temperature < min) min = h.temperature;
    if (h.temperature > max) max = h.temperature;
  }
  const range = max - min || 1;
  return window.map((h, i) => ({
    iso: h.time,
    temperature: h.temperature,
    tempAbs: clamp01((h.temperature - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)),
    tempRel: clamp01((h.temperature - min) / range),
    precipProbability: h.precipitationProbability ?? 0,
    condition: h.condition,
    isPrecip: PRECIP_CONDITIONS.includes(h.condition),
    isNow: i === 0,
  }));
}
