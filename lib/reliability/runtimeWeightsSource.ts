import { cachedFetch } from "../cache.ts";
import { CACHE_TTL_MS } from "../seoul.ts";
import { readWeights } from "./persistence.ts";
import type { WeightsState } from "./types.ts";

/**
 * Server-side, memoized read of the learned precip weights for the fusion layer.
 *
 * - Runs at the fusion layer only (never in a React component, never per
 *   render/frame). Memoized via the shared TTL cache, so the file is read at most
 *   once per CACHE_TTL_MS — weights change at most once/day.
 * - NEVER throws into the render path: readWeights() returns null on a missing or
 *   unparseable file, and cachedFetch wraps a never-throwing fetcher.
 *
 * A null result drives the gate to equal-fallback (byte-for-byte pre-Phase-3).
 */
export async function loadWeightsStateCached(): Promise<WeightsState | null> {
  const result = await cachedFetch("reliability-source-weights", CACHE_TTL_MS, readWeights);
  return result.value;
}
