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
 *   2. Take clips matching that condition. If FEWER THAN 2 match, broaden to the
 *      whole library so there is always something to shuffle between.
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
 * The usable shuffle pool for the current weather. Pure: given the same inputs
 * it returns the same clips (a stable subset of `clips`, never reordered).
 */
export function selectGalleryPool(
  clips: readonly LocationClip[],
  condition: WeatherCondition,
  isDay: boolean,
): LocationClip[] {
  const target = mapToGalleryCondition(condition);
  const byCondition = target ? clips.filter((c) => c.condition === target) : [];

  // Broaden to the whole library when too few clips match — guarantees ≥2 to
  // shuffle between whenever the library itself has ≥2 clips.
  const pool = byCondition.length >= 2 ? byCondition : clips.slice();

  // Soft day/night preference — only applied while it keeps ≥2 clips.
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
