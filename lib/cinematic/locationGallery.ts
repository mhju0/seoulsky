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
 *   2. Time-of-day is a HARD axis: a night sky never serves a daytime clip (or
 *      vice versa) while ANY weather-compatible clip of the correct time exists.
 *      Among the correct-time clips we take the tightest weather tier that has
 *      one — exact condition, then the visually-adjacent family (the dry/overcast
 *      family, the precip family, fog→overcast, snow→overcast), then the whole
 *      library — preferring a tier with ≥2 clips for shuffle variety and
 *      otherwise looping a single correct-time clip rather than bleeding in an
 *      unrelated condition. A dry live sky (clear / partly-cloudy) NEVER serves a
 *      snow or rain clip at any tier — so the gallery can't cut to snow on a
 *      clear morning.
 *   3. Only when NO weather-compatible clip of the correct time exists at all do
 *      we fall back to the opposite time of day (still weather-first, still
 *      dry-safe), so the scene is never blank.
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
  /** Playback speed override. Defaults to 0.7 when unset (slows AI-generated motion to cinematic pace). */
  rate?: number;
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
export const RELATED_CONDITIONS: Record<GalleryCondition, GalleryCondition[]> = {
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
export const DRY_TARGETS: readonly GalleryCondition[] = ["clear", "partly-cloudy"];
/** The precip conditions a dry sky must never serve. */
export const PRECIP_CONDITIONS: readonly GalleryCondition[] = ["snow", "rain"];

/**
 * The usable shuffle pool for the current weather AND time of day. Pure: given
 * the same inputs it returns the same clips (a stable subset of `clips`, never
 * reordered).
 *
 * Time-of-day is a HARD axis: a night sky never serves a daytime clip while any
 * weather-compatible clip of the correct time exists, and vice versa. This is
 * what keeps 22:00-KST nights from showing bright daytime plates when a
 * condition (e.g. partly-cloudy) happens to have no night clip of its own —
 * we'd rather broaden to a correct-time *adjacent* condition (clear/overcast
 * night) than fall back to the condition's own daytime clips.
 */
export function selectGalleryPool(
  clips: readonly LocationClip[],
  condition: WeatherCondition,
  isDay: boolean,
): LocationClip[] {
  const target = mapToGalleryCondition(condition);
  const wantTime: GalleryTimeOfDay = isDay ? "day" : "night";

  // Hard dry-sky invariant, applied to the whole candidate universe up front: a
  // dry live sky (clear / partly-cloudy) never even considers a snow/rain clip,
  // at ANY broadening tier. With no dry clip at all the universe empties and the
  // caller falls back to the procedural field — never a clear morning cut to snow.
  const dry = target != null && DRY_TARGETS.includes(target);
  const universe = dry ? clips.filter((c) => !PRECIP_CONDITIONS.includes(c.condition)) : clips.slice();

  // Weather tiers, narrow → wide. The family list leads with the target itself,
  // so `adjacent` ⊇ `exact`, and `universe` is the widest tier.
  const family = target ? RELATED_CONDITIONS[target] : null;
  const exact = target ? universe.filter((c) => c.condition === target) : [];
  const adjacent = family ? universe.filter((c) => family.includes(c.condition)) : universe.slice();

  const atTime = (cs: readonly LocationClip[]) => cs.filter((c) => c.timeOfDay === wantTime);
  const exactT = atTime(exact);
  const adjacentT = atTime(adjacent);
  const universeT = atTime(universe);

  // 1. Correct time of day, tightest weather tier that offers shuffle variety (≥2).
  if (exactT.length >= 2) return exactT;
  if (adjacentT.length >= 2) return adjacentT;
  // 2. …else loop a single correct-time clip from the tight tier (`adjacent`
  //    already covers a lone exact clip) before bleeding into the whole library.
  if (adjacentT.length >= 1) return adjacentT;
  // 3. …else widen to the whole correct-time library (variety, then a single clip).
  if (universeT.length >= 1) return universeT;
  // 4. No weather-compatible clip of the correct time exists at all — only now
  //    accept the opposite time of day (still weather-first, still dry-safe) so
  //    the scene is never blank.
  for (const tier of [exact, adjacent, universe]) if (tier.length >= 2) return tier;
  for (const tier of [exact, adjacent, universe]) if (tier.length >= 1) return tier;
  return [];
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
