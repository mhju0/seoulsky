import type { ProviderId } from "../types.ts";

/**
 * Data shapes for the precipitation source-reliability system (Phase 1).
 *
 * Phase 1 is offline only: a daily batch logs each forecast source's prediction,
 * fetches the independent KMA observation as ground truth, and writes a per-source
 * daily skill score. Nothing here is read by the runtime /sky pipeline yet — that
 * is Phase 3. See lib/reliability/README.md.
 */

export type RainOutcome = "hit" | "miss" | "false_alarm" | "correct_dry";

/**
 * One source's daily precipitation forecast for a target date. The core fields
 * match the documented log schema {date, source, region, pop, predicted_mm};
 * `loggedAt` is provenance only and is never scored.
 */
export interface ForecastRecord {
  /** Target forecast date, YYYY-MM-DD in Asia/Seoul. */
  date: string;
  /** Forecast source. The KMA *observation* is never logged here (it is the
   *  independent ground truth); KMA's *forecast* may appear as a source. */
  source: ProviderId;
  /** Fixed "seoul" — this app is Seoul-only; carried for forward-compat. */
  region: string;
  /** Probability of precipitation 0–100, or null when the source omits it. */
  pop: number | null;
  /** Forecast daily precipitation total (mm), or null when the source omits it. */
  predicted_mm: number | null;
  /** ISO timestamp the forecast was captured (provenance; not scored). */
  loggedAt: string;
}

/**
 * Independent ground truth — KMA ASOS observed daily precipitation for a
 * completed day. This is NEVER one of the scored forecast sources.
 */
export interface ObservationRecord {
  /** Observed date, YYYY-MM-DD in Asia/Seoul. */
  date: string;
  region: string;
  /** Observed daily precipitation total (mm). */
  observed_mm: number;
  /** Provenance label — always the KMA ASOS observation feed. */
  source: "kma-asos-observation";
  observedAt: string;
}

/**
 * Single-day contingency cell (one-hot: exactly one entry is 1). The cell names
 * are the textbook verification terms; the `correct_negatives` cell corresponds
 * to the `correct_dry` outcome.
 */
export interface Contingency {
  hits: number;
  misses: number;
  false_alarms: number;
  correct_negatives: number;
}

/** Pure scoring output for one source on one day (no I/O fields). */
export interface SourceDayScore {
  predicted_rain: boolean;
  observed_rain: boolean;
  outcome: RainOutcome;
  contingency: Contingency;
  /** CSI for the day: 1 (hit), 0 (miss/false alarm); never null here because a
   *  correct-dry day is not emitted (it carries no precipitation skill). */
  csi: number | null;
  /** Categorical skill in [0,1] with the asymmetric miss/false-alarm penalty. */
  categorical_skill: number;
  /** Quantitative skill in [0,1] from the rainy-day amount error, or null. */
  quantitative_skill: number | null;
  /** Absolute amount error |predicted_mm − observed_mm| (mm) when the source
   *  supplied an amount, else null. Consumed by the Phase 2 hit-loss term. */
  mae: number | null;
  /** Combined daily skill in [0,1]. */
  skill: number;
}

/**
 * Per-source daily skill row written to the daily-skill store. Phase 2's EWMA
 * weight update reads exactly this. Phase 1 only writes it.
 */
export interface DailySkillRecord {
  date: string;
  source: ProviderId;
  region: string;
  pop: number | null;
  predicted_mm: number | null;
  observed_mm: number;
  predicted_rain: boolean;
  observed_rain: boolean;
  outcome: RainOutcome;
  contingency: Contingency;
  csi: number | null;
  categorical_skill: number;
  quantitative_skill: number | null;
  /** Absolute amount error (mm) when an amount was supplied, else null. */
  mae: number | null;
  skill: number;
  scoredAt: string;
}

/** Per-source weight (≥0). Keyed by ProviderId; sums to ~1 after normalization. */
export type WeightsMap = Record<string, number>;

/**
 * Persisted, stateful output of the Phase 2 Hedge updater
 * (data/reliability/source-weights.json). This file MUST survive across
 * scheduled runs (see README) — it is the algorithm's only memory.
 */
export interface WeightsState {
  updatedAt: string;
  /** Cumulative count of informative (loss-bearing) source-day events applied. */
  eventsScored: number;
  /** Daily-skill dates already folded into the weights (idempotency guard). */
  processedDates: string[];
  /** Current per-source weights. */
  weights: WeightsMap;
}
