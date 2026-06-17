/**
 * Seoul-landmark STILL-IMAGE field — manifest schema + pure selection helpers.
 *
 * This is the image-era successor to the video gallery (locationGallery.ts). The
 * scene at /sky no longer plays clips; it composites ONE still "atmospheric color
 * field" plate per landmark × condition × time-anchor, continuously colour-graded
 * by the live sun phase (see buildImageGrade in skyPalette.ts). This module holds
 * only the plain-data shapes and the deterministic, side-effect-free selection
 * logic — no React, no DOM, no I/O — so it is trivially testable and shared by the
 * runtime provider.
 *
 * It deliberately REUSES the video selection contract from {@link locationGallery}
 * (condition mapping, the weather-adjacent broadening family, and the hard
 * dry-sky invariant) so a clear sky never grades into snow/rain — the only thing
 * that changes is the time axis: instead of a binary day|night it has three
 * anchors {@link ImageAnchor} `day | golden | night`, chosen by sun phase. The
 * anchor is the HARD axis (mirroring time-of-day in the gallery): the desired
 * anchor is honoured across every weather tier before we cross to a neighbouring
 * anchor, so a night sky never serves a day plate while any weather-compatible
 * night plate exists.
 *
 * If nothing matches (an empty/absent manifest, or a dry sky with only precip
 * plates) selection returns `null` and the caller falls back to the procedural
 * CSS atmospheric field — never a blank scene.
 */

import {
  mapToGalleryCondition,
  RELATED_CONDITIONS,
  DRY_TARGETS,
  PRECIP_CONDITIONS,
  type GalleryCondition,
} from "./locationGallery.ts";
import type { WeatherCondition } from "../types.ts";

/**
 * The three time-of-day anchors a still is authored for. `golden` is the warm
 * low-sun plate served near sunrise/sunset; `day`/`night` are the high-sun and
 * sub-horizon plates. The continuous grade colours each anchor across its own
 * neighbourhood of the day — we switch anchors rather than grade a day plate all
 * the way to midnight.
 */
export type ImageAnchor = "day" | "golden" | "night";

/** One still plate, mirroring an entry in the image manifest's `images[]`. */
export interface SkyImage {
  landmark: string;
  condition: GalleryCondition;
  anchor: ImageAnchor;
  /** Public path, e.g. `/sky/hanriver__clear__day.webp`. May 404 until generated. */
  src: string;
}

/** The image manifest document (only the fields the runtime consumes). */
export interface SkyImageManifest {
  version: number;
  conditions: GalleryCondition[];
  anchors: ImageAnchor[];
  images: SkyImage[];
}

/**
 * The desired anchor for the current sky. `golden` near the horizon (where the
 * warm low-sun cast dominates), otherwise the plain day/night plate by `isDay`.
 * `goldenFactor` is the same 0…1 horizon bump the gradient already uses.
 */
const GOLDEN_ANCHOR_THRESHOLD = 0.5;
export function pickImageAnchor(isDay: boolean, goldenFactor: number): ImageAnchor {
  if (goldenFactor >= GOLDEN_ANCHOR_THRESHOLD) return "golden";
  return isDay ? "day" : "night";
}

/**
 * Anchor fallback order. The desired anchor leads; a missing plate then borrows
 * its temporal neighbour rather than the procedural field, so the still survives
 * a partially-authored library. `golden` sits between `day` and `night`.
 */
const ANCHOR_FALLBACK: Record<ImageAnchor, ImageAnchor[]> = {
  day: ["day", "golden", "night"],
  golden: ["golden", "day", "night"],
  night: ["night", "golden", "day"],
};

/**
 * The single best still for the live condition + desired anchor, or `null` to
 * fall back to the procedural field. Pure: same inputs → same plate.
 *
 * The anchor is the HARD axis: for each anchor in {@link ANCHOR_FALLBACK} order we
 * try the tightest weather tier that has a plate (exact condition → the
 * visually-adjacent family → the whole dry-safe library) before crossing to the
 * next anchor. A dry live sky (clear / partly-cloudy) NEVER considers a snow/rain
 * plate at any tier — with no dry plate at all the universe empties and we return
 * `null` (never a clear morning graded onto a rain plate).
 */
export function selectSkyImage(
  images: readonly SkyImage[],
  condition: WeatherCondition,
  anchor: ImageAnchor,
): SkyImage | null {
  const target = mapToGalleryCondition(condition);

  // Hard dry-sky invariant up front: strip every precip plate from a dry sky's
  // candidate universe at ALL tiers.
  const dry = target != null && DRY_TARGETS.includes(target);
  const universe = dry ? images.filter((i) => !PRECIP_CONDITIONS.includes(i.condition)) : images.slice();

  // Weather tiers, narrow → wide. The family list leads with the target itself,
  // so `adjacent` ⊇ `exact`, and `universe` is the widest tier.
  const family = target ? RELATED_CONDITIONS[target] : null;
  const exact = target ? universe.filter((i) => i.condition === target) : [];
  const adjacent = family ? universe.filter((i) => family.includes(i.condition)) : universe.slice();
  const tiers = [exact, adjacent, universe] as const;

  // Anchor-first (hard axis), then weather-tier-tightest within each anchor.
  for (const a of ANCHOR_FALLBACK[anchor]) {
    for (const tier of tiers) {
      const hit = tier.find((i) => i.anchor === a);
      if (hit) return hit;
    }
  }
  return null;
}
