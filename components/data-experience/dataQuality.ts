import type { QualityTier } from "@/components/three/quality";

/**
 * Per-tier visual budget for the ATMOSPHERIC CORE scene. Derived from the shared
 * {@link QualityTier} (detectQuality) so the data experience scales the same way
 * the cinematic homepage does — fewer ribbons / motes / particles and lower
 * geometry detail on weaker or mobile GPUs.
 */
export interface DataQuality {
  /** Icosphere subdivision for the thermal core + glass shell. */
  sphereDetail: number;
  /** Wind ribbon count and per-ribbon tube segments. */
  ribbons: number;
  ribbonSegments: number;
  /** Internal cloud-volume sprite puffs. */
  cloudPuffs: number;
  /** Ambient depth motes drifting around the core. */
  motes: number;
  /** Max precipitation particles (actual count scales with intensity). */
  precip: number;
  /** Hourly orbit markers / temperature-ribbon points. */
  orbitPoints: number;
}

const HIGH: DataQuality = {
  sphereDetail: 5,
  ribbons: 9,
  ribbonSegments: 90,
  cloudPuffs: 90,
  motes: 320,
  precip: 1200,
  orbitPoints: 24,
};

const BALANCED: DataQuality = {
  sphereDetail: 4,
  ribbons: 7,
  ribbonSegments: 64,
  cloudPuffs: 56,
  motes: 200,
  precip: 700,
  orbitPoints: 20,
};

const REDUCED: DataQuality = {
  sphereDetail: 3,
  ribbons: 4,
  ribbonSegments: 40,
  cloudPuffs: 30,
  motes: 110,
  precip: 320,
  orbitPoints: 14,
};

export function dataQualityFor(tier: QualityTier): DataQuality {
  return tier === "high" ? HIGH : tier === "balanced" ? BALANCED : REDUCED;
}
