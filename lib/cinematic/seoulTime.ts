/**
 * Seoul-aware time + a continuous sun-phase model.
 *
 * The whole cinematic scene is driven by Seoul wall time and today's
 * sunrise/sunset — never the browser's locale or timezone. Day/night is
 * decided by comparing *absolute instants* (sunrise/sunset carry a +09:00
 * offset, `Date.now()` is an absolute instant), so the result is identical
 * regardless of where the viewer actually is.
 *
 * The output is deliberately continuous: an `elevation` proxy in [-1, 1]
 * plus smooth factors, so the scene can interpolate smoothly through
 * pre-dawn → sunrise → golden hour → blue hour → night rather than snapping
 * at a single minute.
 */

const KST = "Asia/Seoul";
const DAY_MS = 24 * 60 * 60 * 1000;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export type SunPhaseName =
  | "deep-night"
  | "night"
  | "pre-dawn"
  | "sunrise"
  | "early-morning"
  | "daytime"
  | "late-afternoon"
  | "golden-hour"
  | "sunset"
  | "blue-hour";

export interface SunPhase {
  /** Sun-altitude proxy: -1 (solar midnight) · 0 (horizon) · +1 (solar noon). */
  elevation: number;
  /** 0 full night … 1 full day (smoothstep across the horizon). */
  dayFactor: number;
  /** 0 away from horizon … 1 right at the horizon — drives warm twilight bands. */
  twilightFactor: number;
  /** 0 … 1 bump just above the horizon — drives golden-hour warmth. */
  goldenFactor: number;
  /** true while the sun is ascending (before solar noon) — separates dawn from dusk. */
  rising: boolean;
  /** Sun above the horizon. */
  isDay: boolean;
  phase: SunPhaseName;
}

export interface SeoulParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock parts in Asia/Seoul for any instant, independent of the host TZ. */
export function getSeoulParts(date: Date = new Date()): SeoulParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: KST,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  // en-GB emits "24" at midnight in some engines — normalise to 0.
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Sun-altitude proxy from sunrise/sunset, valid across the whole 24h cycle. */
function elevationFromSun(nowMs: number, sunriseMs: number, sunsetMs: number): number {
  const dayLen = sunsetMs - sunriseMs;
  if (dayLen <= 0) return -1;
  const nightLen = Math.max(DAY_MS - dayLen, 1);

  if (nowMs >= sunriseMs && nowMs <= sunsetMs) {
    // Daytime: 0 at sunrise → 1 at solar noon → 0 at sunset.
    return Math.sin(Math.PI * ((nowMs - sunriseMs) / dayLen));
  }
  // Nighttime: 0 at either horizon crossing → -1 at solar midnight.
  const sinceSunset =
    nowMs > sunsetMs ? nowMs - sunsetMs : nowMs - (sunriseMs - nightLen);
  return -Math.sin(Math.PI * clamp01(sinceSunset / nightLen));
}

/** Degraded estimate when sunrise/sunset are unavailable (assumes ~Seoul averages). */
function elevationFromClock(now: Date): { elevation: number; rising: boolean } {
  const { hour, minute } = getSeoulParts(now);
  const h = hour + minute / 60;
  const RISE = 6.0;
  const SET = 18.5;
  const noon = (RISE + SET) / 2;
  const nightLen = 24 - (SET - RISE);
  let elevation: number;
  if (h >= RISE && h <= SET) {
    elevation = Math.sin(Math.PI * ((h - RISE) / (SET - RISE)));
  } else {
    const since = h > SET ? h - SET : h + 24 - SET;
    elevation = -Math.sin(Math.PI * clamp01(since / nightLen));
  }
  return { elevation, rising: h < noon };
}

function classify(elevation: number, rising: boolean): SunPhaseName {
  if (elevation >= 0.32) return "daytime";
  if (rising) {
    if (elevation < -0.5) return "deep-night";
    if (elevation < -0.16) return "pre-dawn";
    if (elevation < 0.06) return "sunrise";
    return "early-morning";
  }
  // Descending side.
  if (elevation >= 0.12) return "late-afternoon";
  if (elevation >= 0.0) return "golden-hour";
  if (elevation >= -0.1) return "sunset";
  if (elevation >= -0.42) return "blue-hour";
  return elevation < -0.62 ? "deep-night" : "night";
}

export interface SunPhaseInput {
  now?: Date;
  /** Today's sunrise/sunset as ISO strings with offset (KST). */
  sunrise?: string | null;
  sunset?: string | null;
  /** Open-Meteo's is_day flag, used only as a tie-breaker near the horizon. */
  isDayHint?: boolean | null;
}

/**
 * The single source of truth for "what does the sky look like, time-wise".
 * Pure and cheap — safe to call every animation frame.
 */
export function computeSunPhase({
  now = new Date(),
  sunrise,
  sunset,
  isDayHint,
}: SunPhaseInput): SunPhase {
  const nowMs = now.getTime();
  const sunriseMs = sunrise ? Date.parse(sunrise) : NaN;
  const sunsetMs = sunset ? Date.parse(sunset) : NaN;

  let elevation: number;
  let rising: boolean;

  if (Number.isFinite(sunriseMs) && Number.isFinite(sunsetMs)) {
    elevation = elevationFromSun(nowMs, sunriseMs, sunsetMs);
    rising = nowMs < (sunriseMs + sunsetMs) / 2;
  } else {
    ({ elevation, rising } = elevationFromClock(now));
  }

  // dayFactor follows the geometry; the is_day hint only nudges the ambiguous
  // band right around the horizon so we never disagree with the provider there.
  let dayFactor = smoothstep(-0.1, 0.16, elevation);
  if (isDayHint === true && elevation > -0.16) dayFactor = Math.max(dayFactor, 0.55);
  if (isDayHint === false && elevation < 0.16) dayFactor = Math.min(dayFactor, 0.45);

  const twilightFactor = smoothstep(0.26, 0, Math.abs(elevation)); // 1 at horizon
  const goldenFactor = clamp01(1 - Math.abs(elevation - 0.06) / 0.17);

  return {
    elevation,
    dayFactor,
    twilightFactor,
    goldenFactor,
    rising,
    isDay: elevation >= 0,
    phase: classify(elevation, rising),
  };
}
