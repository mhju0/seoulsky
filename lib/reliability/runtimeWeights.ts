import type { WeightsMap, WeightsState } from "./types.ts";

/**
 * Phase 3 — gated runtime consumption of the learned precip weights.
 *
 * This module is PURE (no I/O): it decides, from a WeightsState (or null), how
 * much to trust the learned weights and produces the effective per-source weights
 * the fusion layer should use. The durable-state read + memoization lives in
 * runtimeWeightsSource.ts; the application to precip fields lives in skyFusion.ts.
 *
 * The #1 contract: when the gate is NOT met (the normal state until the KMA
 * observation key is active and enough events have accrued), the effective
 * weights are EQUAL, which makes the precip fusion byte-for-byte identical to the
 * pre-Phase-3 behavior. Equal-fallback is the rock-solid default, not an afterthought.
 *
 * ──────────────────────── config block — all thresholds ─────────────────────
 */
/** No successful observation cycle for this many days ⇒ degrade to equal. */
export const STALE_DAYS = 7;
/** Below this many scored events ⇒ pre-warm-up ⇒ pure equal (no learned influence). */
export const WARMUP_EVENTS = 5;
/** At/above this many events ⇒ full confidence in the learned weights. */
export const FULL_CONFIDENCE_EVENTS = 20;
// ──────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export type PrecipWeightMode = "equal-fallback" | "ramping" | "learned";

export interface PrecipWeighting {
  /** equal-fallback (gated) · ramping (partial) · learned (full confidence). */
  mode: PrecipWeightMode;
  /** Short, debug-only explanation. */
  reason: string;
  /** 0 = pure equal, 1 = pure learned. */
  confidence: number;
  /** Effective per-source weights over the requested sources (always sums to 1). */
  weights: WeightsMap;
}

/**
 * Confidence ramp in [0,1]: 0 at/below WARMUP_EVENTS, 1 at/above
 * FULL_CONFIDENCE_EVENTS, linear between. Avoids a hard switch (and a visible
 * scene pop) when crossing the warm-up threshold.
 */
export function precipConfidence(eventsScored: number): number {
  const span = FULL_CONFIDENCE_EVENTS - WARMUP_EVENTS;
  if (span <= 0) return eventsScored >= FULL_CONFIDENCE_EVENTS ? 1 : 0;
  return clamp01((eventsScored - WARMUP_EVENTS) / span);
}

/** Equal weights over the given sources. */
export function equalWeights(sources: readonly string[]): WeightsMap {
  const w = sources.length === 0 ? 0 : 1 / sources.length;
  return Object.fromEntries(sources.map((s) => [s, w]));
}

/** Learned weights restricted to `sources` and renormalized; equal if degenerate. */
function restrictedLearned(state: WeightsState, sources: readonly string[]): WeightsMap {
  const raw = sources.map((s) => state.weights[s] ?? 0);
  const total = raw.reduce((a, b) => a + b, 0);
  if (total <= 0) return equalWeights(sources);
  return Object.fromEntries(sources.map((s, i) => [s, raw[i] / total]));
}

/**
 * effective = lerp(equal, learned, confidence), per source. Both inputs sum to 1,
 * so the result does too. confidence ≤ 0 (or no state) ⇒ exactly equal weights.
 */
export function effectiveWeights(
  state: WeightsState | null,
  sources: readonly string[],
  confidence: number,
): WeightsMap {
  const equal = equalWeights(sources);
  if (!state || confidence <= 0) return equal;
  const learned = restrictedLearned(state, sources);
  return Object.fromEntries(
    sources.map((s) => [s, (1 - confidence) * equal[s] + confidence * learned[s]]),
  );
}

/**
 * Resolve how the precip fusion should weight `sources` given the persisted state.
 * Degrades to EQUAL (byte-for-byte pre-Phase-3 behavior) when durable state is
 * missing/unparseable, implausibly future-dated, stale, or pre-warm-up.
 */
export function gatePrecipWeighting(
  state: WeightsState | null,
  sources: readonly string[],
  now: Date,
): PrecipWeighting {
  const equal = equalWeights(sources);

  if (!state) {
    return { mode: "equal-fallback", reason: "no-weights-state", confidence: 0, weights: equal };
  }

  const ageMs = now.getTime() - Date.parse(state.updatedAt);
  if (Number.isFinite(ageMs) && ageMs < -MAX_FUTURE_SKEW_MS) {
    return { mode: "equal-fallback", reason: "future-checkpoint", confidence: 0, weights: equal };
  }
  const ageDays = ageMs / DAY_MS;
  if (!Number.isFinite(ageDays) || ageDays > STALE_DAYS) {
    return { mode: "equal-fallback", reason: "stale", confidence: 0, weights: equal };
  }

  const confidence = precipConfidence(state.eventsScored);
  if (confidence <= 0) {
    return { mode: "equal-fallback", reason: "pre-warmup", confidence: 0, weights: equal };
  }

  const weights = effectiveWeights(state, sources, confidence);
  const mode: PrecipWeightMode = confidence >= 1 ? "learned" : "ramping";
  return { mode, reason: mode, confidence, weights };
}
