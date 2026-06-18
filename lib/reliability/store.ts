import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DailySkillRecord, ForecastRecord, WeightsState } from "./types.ts";

/**
 * Append-only JSONL persistence for the reliability batch. Two files:
 *   forecast-log.jsonl  — one ForecastRecord per source per target day
 *   daily-skill.jsonl   — one DailySkillRecord per scored source per day
 *
 * JSONL keeps the daily batch append-only and crash-tolerant. Volume is tiny
 * (≤5 sources/day) so reading a whole file for de-dupe is fine. The directory is
 * runtime-generated and git-ignored; nothing here is committed (no fabricated
 * data ever lands in the repo).
 */

const FORECAST_LOG = "forecast-log.jsonl";
const DAILY_SKILL = "daily-skill.jsonl";
const WEIGHTS_FILE = "source-weights.json";

/** Output directory — overridable so cron/CI can point at durable storage. */
export function reliabilityDataDir(): string {
  return process.env.RELIABILITY_DATA_DIR?.trim() || path.join(process.cwd(), "data", "reliability");
}

async function readJsonl<T>(file: string): Promise<T[]> {
  let text: string;
  try {
    text = await readFile(path.join(reliabilityDataDir(), file), "utf8");
  } catch {
    return []; // not created yet → empty
  }
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

async function appendJsonl(file: string, rows: readonly object[]): Promise<void> {
  if (rows.length === 0) return;
  const dir = reliabilityDataDir();
  await mkdir(dir, { recursive: true });
  const body = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  await appendFile(path.join(dir, file), body, "utf8");
}

/**
 * Append forecasts, skipping any (date, source) already logged so each target
 * day keeps a single forecast per source at a consistent lead time (a re-run
 * the same day never double-counts). Returns the number actually appended.
 */
export async function appendForecasts(records: readonly ForecastRecord[]): Promise<number> {
  const existing = await readJsonl<ForecastRecord>(FORECAST_LOG);
  const seen = new Set(existing.map((r) => `${r.date}|${r.source}`));
  const fresh = records.filter((r) => !seen.has(`${r.date}|${r.source}`));
  await appendJsonl(FORECAST_LOG, fresh);
  return fresh.length;
}

/** All logged forecasts for a given target date. */
export async function readForecasts(date: string): Promise<ForecastRecord[]> {
  const all = await readJsonl<ForecastRecord>(FORECAST_LOG);
  return all.filter((r) => r.date === date);
}

/** Every scored daily-skill record (used by the Phase 2 weight updater). */
export async function readDailySkill(): Promise<DailySkillRecord[]> {
  return readJsonl<DailySkillRecord>(DAILY_SKILL);
}

/**
 * Persisted Hedge weight state, or null when never written. This file is the
 * algorithm's only memory — it MUST survive across scheduled runs (see README).
 */
export async function readWeights(): Promise<WeightsState | null> {
  try {
    const text = await readFile(path.join(reliabilityDataDir(), WEIGHTS_FILE), "utf8");
    return JSON.parse(text) as WeightsState;
  } catch {
    return null;
  }
}

export async function writeWeights(state: WeightsState): Promise<void> {
  const dir = reliabilityDataDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, WEIGHTS_FILE), JSON.stringify(state, null, 2) + "\n", "utf8");
}

/**
 * Append daily skill rows, skipping any (date, source) already scored so reruns
 * are idempotent. Returns the number actually appended.
 */
export async function appendDailySkill(records: readonly DailySkillRecord[]): Promise<number> {
  const existing = await readJsonl<DailySkillRecord>(DAILY_SKILL);
  const seen = new Set(existing.map((r) => `${r.date}|${r.source}`));
  const fresh = records.filter((r) => !seen.has(`${r.date}|${r.source}`));
  await appendJsonl(DAILY_SKILL, fresh);
  return fresh.length;
}
