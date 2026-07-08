import { readFile } from "node:fs/promises";
import path from "node:path";
import type { WeightsState } from "./types.ts";

const WEIGHTS_FILE = "source-weights.json";

/** Output directory — overridable so cron/CI can point at durable storage. */
export function reliabilityDataDir(): string {
  return process.env.RELIABILITY_DATA_DIR?.trim() || path.join(process.cwd(), "data", "reliability");
}

function weightsFilePath(): string {
  const dir = process.env.RELIABILITY_DATA_DIR?.trim();
  if (dir) return path.join(dir, WEIGHTS_FILE);
  return path.join(process.cwd(), "data", "reliability", WEIGHTS_FILE);
}

/**
 * Persisted Hedge weight state, or null when never written. This reader is kept
 * narrow because it is imported by the live /api/sky route.
 */
export async function readWeights(): Promise<WeightsState | null> {
  try {
    const text = await readFile(weightsFilePath(), "utf8");
    return JSON.parse(text) as WeightsState;
  } catch {
    return null;
  }
}
