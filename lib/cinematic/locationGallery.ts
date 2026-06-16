/**
 * Seoul-landmark VIDEO gallery — manifest schema + pure selection helpers.
 *
 * The gallery at /sky reads `public/cinematic/manifest.json` (a location ×
 * condition × day|night library produced offline with Higgsfield) and shuffles
 * the clips whose condition matches the LIVE Seoul weather. This module holds
 * only the plain-data shapes and the deterministic, side-effect-free selection
 * logic — no React, no DOM, no I/O — so it is trivially testable
 * (locationGallery.test.ts) and shared by the runtime gallery component.
 *
 * Selection contract (matches the runbook):
 *   1. Map the live {@link WeatherCondition} to one of the manifest's coarse
 *      gallery conditions.
 *   2. Take clips matching that condition. If FEWER THAN 2 match, broaden — but
 *      WEATHER-FIRST: first to the visually-adjacent conditions (the dry/overcast
 *      family, the precip family, fog→overcast, snow→overcast) and only then, if
 *      that is still too small, to the whole library. A dry live sky (clear /
 *      partly-cloudy) NEVER serves a snow or rain clip, even from that last
 *      whole-library fallback — so the gallery can't cut to snow on a clear
 *      morning.
 *   3. Within that pool, prefer the matching time-of-day (day|night) — but only
 *      when ≥2 such clips exist, so day/night preference never starves the
 *      shuffle. Otherwise keep the broader pool.
 *
 * If the pool ends up with 0 clips (an empty/broken manifest), the caller falls
 * back to the procedural atmospheric field — never a blank or frozen frame.
 */

import type { WeatherCondition } from "../types.ts";

/** The coarse condition buckets the offline library is authored against. */
export type GalleryCondition =
  | "clear"
  | "partly-cloudy"
  | "overcast"
  | "rain"
  | "snow"
  | "fog";

export type GalleryTimeOfDay = "day" | "night";

/** One playable clip, mirroring an entry in manifest.json `clips[]`. */
export interface LocationClip {
  id: string;
  location: string;
  condition: GalleryCondition;
  timeOfDay: GalleryTimeOfDay;
  /** H.264 source of record (always present for a generated clip). */
  mp4: string;
  /** Optional modern source (VP9/AV1); preferred when present. */
  webm: string | null;
  width?: number;
  height?: number;
  duration?: number;
  /** Authored loop seam hints (seconds), used to bias the crossfade timing. */
  loopIn?: number;
  loopOut?: number;
  /** A signature shot for its landmark (purely descriptive metadata). */
  hero?: boolean;
}

/** The whole manifest.json document (only the fields the runtime consumes). */
export interface LocationManifest {
  version: number;
  conditions: GalleryCondition[];
  timesOfDay: GalleryTimeOfDay[];
  clips: LocationClip[];
}

/**
 * Map a fine-grained live condition to the coarse gallery bucket. Returns
 * `null` for conditions with no sensible video match (e.g. `unknown`) so the
 * caller broadens to the whole library.
 */
export function mapToGalleryCondition(condition: WeatherCondition): GalleryCondition | null {
  switch (condition) {
    case "clear":
      return "clear";
    case "partly-cloudy":
      return "partly-cloudy";
    case "cloudy":
    case "overcast":
      return "overcast";
    case "fog":
      return "fog";
    // Every "wet" condition shares the rain library; FX adds the lightning flash
    // for thunderstorms on top of the rain clip.
    case "drizzle":
    case "rain":
    case "heavy-rain":
    case "thunderstorm":
    case "sleet":
      return "rain";
    case "snow":
      return "snow";
    case "unknown":
    default:
      return null;
  }
}

/** Ordered source list for one clip — webm preferred, mp4 fallback. */
export function clipSources(clip: LocationClip): { src: string; type: string }[] {
  const out: { src: string; type: string }[] = [];
  if (clip.webm) out.push({ src: clip.webm, type: "video/webm" });
  if (clip.mp4) out.push({ src: clip.mp4, type: "video/mp4" });
  return out;
}

/**
 * Weather-adjacent broadening. When the exact-condition pool has too few clips
 * we widen to these visually-compatible conditions BEFORE opening to the whole
 * library, so a sparse condition cuts to a related sky (not a jarring one). Each
 * list leads with the condition itself.
 */
const RELATED_CONDITIONS: Record<GalleryCondition, GalleryCondition[]> = {
  // Dry / overcast family — these three broaden among themselves.
  clear: ["clear", "partly-cloudy", "overcast"],
  "partly-cloudy": ["partly-cloudy", "clear", "overcast"],
  overcast: ["overcast", "partly-cloudy", "clear"],
  // Precip family (live thunderstorm already folds into `rain` upstream).
  rain: ["rain"],
  // Fog and snow widen to the calm overcast deck before the whole library.
  fog: ["fog", "overcast"],
  snow: ["snow", "overcast"],
};

/** Dry live skies that must NEVER show a precip clip (snow/rain) in their pool. */
const DRY_TARGETS: readonly GalleryCondition[] = ["clear", "partly-cloudy"];

/**
 * The usable shuffle pool for the current weather. Pure: given the same inputs
 * it returns the same clips (a stable subset of `clips`, never reordered).
 */
export function selectGalleryPool(
  clips: readonly LocationClip[],
  condition: WeatherCondition,
  isDay: boolean,
): LocationClip[] {
  const target = mapToGalleryCondition(condition);

  // 1. Exact-condition match.
  const exact = target ? clips.filter((c) => c.condition === target) : [];

  // 2. Broaden when too few exact clips: first to the weather-adjacent family,
  //    then (only if that is still too small) to the whole library — so there is
  //    always ≥2 to shuffle between whenever the library itself has ≥2 clips.
  let pool: LocationClip[];
  if (exact.length >= 2) {
    pool = exact;
  } else if (target) {
    const family = RELATED_CONDITIONS[target];
    const related = clips.filter((c) => family.includes(c.condition));
    pool = related.length >= 2 ? related : clips.slice();
  } else {
    pool = clips.slice();
  }

  // 3. Hard invariant: a dry live sky (clear / partly-cloudy) never serves a
  //    snow or rain clip — even from the whole-library fallback above. This is
  //    unconditional: if the library holds no dry clip at all, the pool empties
  //    and the caller falls back to the procedural field, rather than cutting a
  //    clear morning to snow.
  if (target && DRY_TARGETS.includes(target)) {
    pool = pool.filter((c) => c.condition !== "snow" && c.condition !== "rain");
  }

  // 4. Soft day/night preference — only applied while it keeps ≥2 clips.
  const wantTime: GalleryTimeOfDay = isDay ? "day" : "night";
  const byTime = pool.filter((c) => c.timeOfDay === wantTime);
  return byTime.length >= 2 ? byTime : pool;
}

/**
 * Pick the next clip to crossfade to: a random clip from `pool` that is not the
 * one currently showing (when avoidable). With a single-clip pool it returns
 * that clip (the gallery simply keeps looping it). Deterministic when `rand` is
 * provided.
 */
export function pickNextClip(
  pool: readonly LocationClip[],
  currentId: string | null,
  rand: () => number = Math.random,
): LocationClip | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  const others = pool.filter((c) => c.id !== currentId);
  const arr = others.length > 0 ? others : pool;
  return arr[Math.floor(rand() * arr.length)] ?? arr[0];
}
