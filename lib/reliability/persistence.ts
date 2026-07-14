import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DailySkillRecord, ForecastRecord, WeightsState } from "./types.ts";

const FORECAST_LOG = "forecast-log.jsonl";
const DAILY_SKILL = "daily-skill.jsonl";
const WEIGHTS_FILE = "source-weights.json";

type DatedSourceRecord = { date: string; source: string };

/** Output directory — overridable so cron/CI can point at durable storage. */
export function reliabilityDataDir(): string {
  return (
    process.env.RELIABILITY_DATA_DIR?.trim() ||
    path.join(/* turbopackIgnore: true */ process.cwd(), "data", "reliability")
  );
}

function filePath(file: string): string {
  // Runtime data can point outside the deploy bundle; it is never an importable asset.
  return path.join(/* turbopackIgnore: true */ reliabilityDataDir(), file);
}

async function readJsonl<T>(file: string): Promise<T[]> {
  let text: string;
  try {
    text = await readFile(filePath(file), "utf8");
  } catch {
    return [];
  }
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

async function appendJsonl(file: string, rows: readonly object[]): Promise<void> {
  if (rows.length === 0) return;
  await mkdir(reliabilityDataDir(), { recursive: true });
  await appendFile(filePath(file), rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
}

async function appendUniqueJsonl<T extends DatedSourceRecord>(file: string, records: readonly T[]): Promise<number> {
  const existing = await readJsonl<T>(file);
  const seen = new Set(existing.map((record) => `${record.date}|${record.source}`));
  const fresh = records.filter((record) => !seen.has(`${record.date}|${record.source}`));
  await appendJsonl(file, fresh);
  return fresh.length;
}

/** Missing and corrupt weight data deliberately degrade to the equal-weight fallback. */
export async function readWeights(): Promise<WeightsState | null> {
  try {
    return JSON.parse(await readFile(filePath(WEIGHTS_FILE), "utf8")) as WeightsState;
  } catch {
    return null;
  }
}

export async function writeWeights(state: WeightsState): Promise<void> {
  await mkdir(reliabilityDataDir(), { recursive: true });
  await writeFile(filePath(WEIGHTS_FILE), JSON.stringify(state, null, 2) + "\n", "utf8");
}

/** Append forecasts once per (target date, source), so a re-run stays idempotent. */
export function appendForecasts(records: readonly ForecastRecord[]): Promise<number> {
  return appendUniqueJsonl(FORECAST_LOG, records);
}

export async function readForecasts(date: string): Promise<ForecastRecord[]> {
  return (await readJsonl<ForecastRecord>(FORECAST_LOG)).filter((record) => record.date === date);
}

export function readDailySkill(): Promise<DailySkillRecord[]> {
  return readJsonl<DailySkillRecord>(DAILY_SKILL);
}

/** Append scored rows once per (date, source), so batch reruns remain idempotent. */
export function appendDailySkill(records: readonly DailySkillRecord[]): Promise<number> {
  return appendUniqueJsonl(DAILY_SKILL, records);
}
