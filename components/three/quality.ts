/**
 * Automatic quality tiers. Picks a reasonable tier from the device, caps the
 * device-pixel-ratio, and scales cloud/particle/star counts.
 * `prefersReducedMotion` is reported separately: reduced motion keeps the full
 * atmosphere but calms the camera and precipitation (handled in the rig).
 *
 * Note: the cinematic grade is now achieved with ACES tone mapping + additive
 * glow sprites + CSS vignette/grain (no @react-three/postprocessing), so there
 * are no per-tier post-effect toggles here anymore.
 */

export type QualityTier = "high" | "balanced" | "reduced";

export interface QualitySettings {
  tier: QualityTier;
  /** [min, max] device pixel ratio passed to <Canvas dpr>. */
  dpr: [number, number];
  /** Max cloud billboard puffs in the field. */
  cloudPuffs: number;
  /** Max rain streaks / snow flakes (actual count scales with intensity). */
  rainCount: number;
  snowCount: number;
  stars: number;
  antialias: boolean;
}

const HIGH: QualitySettings = {
  tier: "high",
  dpr: [1, 2],
  cloudPuffs: 340,
  rainCount: 1500,
  snowCount: 900,
  stars: 1600,
  antialias: true,
};

const BALANCED: QualitySettings = {
  tier: "balanced",
  dpr: [1, 1.6],
  cloudPuffs: 200,
  rainCount: 850,
  snowCount: 520,
  stars: 1000,
  antialias: true,
};

const REDUCED: QualitySettings = {
  tier: "reduced",
  dpr: [1, 1.25],
  cloudPuffs: 95,
  rainCount: 380,
  snowCount: 240,
  stars: 520,
  antialias: false,
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
