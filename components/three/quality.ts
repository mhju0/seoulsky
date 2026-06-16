/**
 * Automatic quality tiers. Picks a reasonable tier from the device and caps the
 * device-pixel-ratio. `prefersReducedMotion` is reported separately: reduced
 * motion keeps the full atmosphere but calms the camera and precipitation
 * (handled in the rig).
 *
 * The tier drives the WebGL field's shader octave/snow-layer defines and the FX
 * overlay's particle pools; `dpr` caps the canvas backing-store resolution. The
 * old per-component cloud/rain/snow/star counts are gone with the deleted
 * particle components — only `tier` and `dpr` are consumed now.
 */

export type QualityTier = "high" | "balanced" | "reduced";

export interface QualitySettings {
  tier: QualityTier;
  /** [min, max] device pixel ratio passed to <Canvas dpr>. */
  dpr: [number, number];
}

const HIGH: QualitySettings = {
  tier: "high",
  dpr: [1, 2],
};

const BALANCED: QualitySettings = {
  tier: "balanced",
  dpr: [1, 1.6],
};

const REDUCED: QualitySettings = {
  tier: "reduced",
  dpr: [1, 1.25],
};

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function detectQuality(): QualitySettings {
  if (typeof navigator === "undefined") return BALANCED;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (!mobile && cores >= 8 && mem >= 8) return HIGH;
  if (mobile || cores <= 4 || mem <= 4) return REDUCED;
  return BALANCED;
}

/** Lightweight WebGL capability probe used before mounting the Canvas. */
export function hasWebGL(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}
