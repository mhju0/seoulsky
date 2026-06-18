import type { DailySkillRecord, RainOutcome, WeightsMap, WeightsState } from "./types.ts";

/**
 * Phase 2 — stateful multiplicative-weights (Hedge) updater. Pure functions
 * (no I/O); the batch script wires persistence around them. Offline only:
 * nothing here is read by the runtime pipeline — that is Phase 3.
 *
 * Per scored day, per source, a LOSS is derived from the contingency outcome,
 * then `weight_i *= exp(-ETA * loss_i)`, renormalized to sum 1 and held within
 * [W_FLOOR, W_CAP]. Days are applied in chronological order; an already-applied
 * date is never re-applied (idempotent via WeightsState.processedDates).
 *
 * ─────────────── config block — the knob surface (all tunable) ───────────────
 */
/** Observed rain, forecast dry — the costliest error. */
export const MISS_LOSS = 1.0;
/** Observed dry, forecast rain — costly, but less than a miss. */
export const FALSE_ALARM_LOSS = 0.6;
/** Both rain — a small base loss... */
export const HIT_BASE_LOSS = 0.1;
/** ...plus an amount term, applied only when the source supplied an amount. */
export const HIT_MAE_WEIGHT = 0.4;
/** Amount error (mm) at which the hit amount term saturates. */
export const MAE_SCALE_MM = 10;
/** Learning rate — the speed dial. Higher = weights move faster. */
export const DEFAULT_ETA = 0.5;
/** No source is ever fully silenced... */
export const W_FLOOR = 0.05;
/** ...nor fully trusted. */
export const W_CAP = 0.6;
// ──────────────────────────────────────────────────────────────────────────────

/** ETA from RELIABILITY_ETA when valid (>0), else DEFAULT_ETA. Used by the script. */
export function resolveEta(): number {
  const v = Number(process.env.RELIABILITY_ETA);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_ETA;
}

/**
 * Loss for one source-day, or null when the day must not move that source's
 * weight (a correct-dry day — both dry). A hit's amount term is added only when
 * an amount was supplied (mae != null); without one, only the base loss applies.
 */
export function lossFromOutcome(outcome: RainOutcome, mae: number | null): number | null {
  switch (outcome) {
    case "miss":
      return MISS_LOSS;
    case "false_alarm":
      return FALSE_ALARM_LOSS;
    case "hit": {
      const amountTerm = mae === null ? 0 : HIT_MAE_WEIGHT * Math.min(1, mae / MAE_SCALE_MM);
      return HIT_BASE_LOSS + amountTerm;
    }
    case "correct_dry":
      return null; // no update — correct-dry days don't move weights
  }
}

/** Equal weights over the given sources (cold start). */
export function coldStartWeights(sources: readonly string[]): WeightsMap {
  const w = sources.length === 0 ? 0 : 1 / sources.length;
  return Object.fromEntries(sources.map((s) => [s, w]));
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function renormalize(w: WeightsMap): WeightsMap {
  const keys = Object.keys(w);
  const total = sum(Object.values(w));
  if (total <= 0) {
    const eq = keys.length === 0 ? 0 : 1 / keys.length;
    return Object.fromEntries(keys.map((k) => [k, eq]));
  }
  return Object.fromEntries(keys.map((k) => [k, w[k] / total]));
}

/**
 * Project weights onto { sum = 1, floor ≤ w ≤ cap }. The spec's
 * "renormalize → clamp → renormalize" is applied repeatedly to a fixed point so
 * a capped weight cannot drift back over the cap after the final renormalize:
 * at convergence every weight is within [floor, cap] and the vector sums to 1.
 */
export function normalizeClamped(raw: WeightsMap, floor = W_FLOOR, cap = W_CAP): WeightsMap {
  let w = renormalize(raw);
  for (let i = 0; i < 100; i++) {
    const clamped = Object.fromEntries(
      Object.entries(w).map(([k, v]) => [k, Math.min(cap, Math.max(floor, v))]),
    );
    const next = renormalize(clamped);
    const delta = Math.max(0, ...Object.keys(next).map((k) => Math.abs(next[k] - w[k])));
    w = next;
    if (delta < 1e-12) break;
  }
  return w;
}

/**
 * Apply one day's losses (Hedge multiplicative update + bounded renormalize).
 * Sources absent from `losses` keep a factor of 1. An empty loss map (a fully
 * correct-dry / no-event day) returns the weights unchanged — zero movement.
 */
export function applyDayLosses(
  weights: WeightsMap,
  losses: Map<string, number>,
  eta: number = DEFAULT_ETA,
): WeightsMap {
  if (losses.size === 0) return { ...weights };
  const multiplied: WeightsMap = {};
  for (const [source, w] of Object.entries(weights)) {
    const loss = losses.get(source) ?? 0;
    multiplied[source] = w * Math.exp(-eta * loss);
  }
  return normalizeClamped(multiplied);
}

/** Fresh cold-start state (equal weights, nothing processed). */
export function initialWeightsState(
  sources: readonly string[],
  now: Date = new Date(),
): WeightsState {
  return {
    updatedAt: now.toISOString(),
    eventsScored: 0,
    processedDates: [],
    weights: coldStartWeights(sources),
  };
}

/**
 * Fold every not-yet-processed daily-skill date into the weights, in
 * chronological order. Re-running with already-applied dates is a no-op for
 * those dates (idempotent). `eventsScored` accumulates only informative
 * (loss-bearing) records; correct-dry records move nothing.
 */
export function applyUnprocessed(
  state: WeightsState,
  records: readonly DailySkillRecord[],
  opts: { eta?: number; now?: Date } = {},
): WeightsState {
  const eta = opts.eta ?? DEFAULT_ETA;
  const processed = new Set(state.processedDates);

  const byDate = new Map<string, DailySkillRecord[]>();
  for (const r of records) {
    if (processed.has(r.date)) continue; // already applied → skip (idempotent)
    byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  }

  let weights = { ...state.weights };
  // Defensive: cover any source not present in the cold-start map (e.g. a grown
  // registry) at the current mean so it starts neutral before normalization.
  const mean = Object.values(weights).length ? sum(Object.values(weights)) / Object.values(weights).length : 0;
  for (const list of byDate.values()) {
    for (const r of list) if (!(r.source in weights)) weights[r.source] = mean;
  }

  let eventsScored = state.eventsScored;
  const newProcessed = [...state.processedDates];

  for (const date of [...byDate.keys()].sort()) {
    const losses = new Map<string, number>();
    for (const r of byDate.get(date)!) {
      const loss = lossFromOutcome(r.outcome, r.mae);
      if (loss === null) continue; // correct-dry → no contribution
      losses.set(r.source, loss);
      eventsScored += 1;
    }
    weights = applyDayLosses(weights, losses, eta);
    newProcessed.push(date);
  }

  return {
    updatedAt: (opts.now ?? new Date()).toISOString(),
    eventsScored,
    processedDates: newProcessed.sort(),
    weights,
  };
}
