/**
 * Daily precipitation source-reliability batch — Phase 1 (log + ground truth + score).
 *
 * Standalone: run from cron or a GitHub Action, NEVER at request time. No runtime
 * AI calls. Reads the existing 5-source weather pipeline; the KMA ASOS observation
 * is the independent ground truth and is never scored as a forecast source.
 *
 *   node --env-file-if-exists=.env.local --env-file-if-exists=.env scripts/precip-reliability.ts
 *   # or: npm run reliability:daily
 *
 * Each run:
 *   1. logs every live source's forecast for TOMORROW (a consistent ~1-day lead),
 *   2. fetches KMA ASOS observed precipitation for YESTERDAY (a completed day),
 *   3. scores yesterday by joining its previously-logged forecasts with the truth.
 *
 * Phase 1 writes only the forecast log and the daily-skill file. It does NOT
 * update any live weight file and does NOT touch the /sky render path. The first
 * scores appear once a target day has both a prior-logged forecast and an
 * observation (≥2 consecutive run days); missing data is skipped, never invented.
 */
import { collectForecasts } from "../lib/reliability/forecastLog.ts";
import { fetchObservedPrecip } from "../lib/reliability/groundTruth.ts";
import { REGION } from "../lib/reliability/constants.ts";
import { scoreSourceDay } from "../lib/reliability/score.ts";
import {
  appendDailySkill,
  appendForecasts,
  readForecasts,
  reliabilityDataDir,
} from "../lib/reliability/store.ts";
import type { DailySkillRecord } from "../lib/reliability/types.ts";

const DAY_MS = 86_400_000;

const seoulYmd = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD in Asia/Seoul, `offsetDays` from `base`. */
function seoulDate(offsetDays: number, base: Date): string {
  return seoulYmd.format(new Date(base.getTime() + offsetDays * DAY_MS));
}

async function main(): Promise<void> {
  const now = new Date();
  const tomorrow = seoulDate(1, now); // forecasts to log (verified ~1 day later)
  const yesterday = seoulDate(-1, now); // most recently completed day to score

  console.log(`precip-reliability · run ${now.toISOString()} · data dir ${reliabilityDataDir()}`);

  // 1) Forecast log — capture each live source's forecast for tomorrow.
  const forecasts = await collectForecasts(tomorrow, now);
  const appended = await appendForecasts(forecasts);
  console.log(
    `[forecast] ${tomorrow}: ${forecasts.length} live source(s) [${forecasts
      .map((f) => f.source)
      .join(", ")}], +${appended} new row(s)`,
  );

  // 2) Ground truth — KMA ASOS observed precip for yesterday.
  const observation = await fetchObservedPrecip(yesterday);
  if (!observation) {
    console.log(`[truth] ${yesterday}: no observation available → skip scoring (no fabrication)`);
    return;
  }
  console.log(`[truth] ${yesterday}: observed ${observation.observed_mm} mm (KMA ASOS, station 108)`);

  // 3) Score — join yesterday's previously-logged forecasts with the truth.
  const priorForecasts = await readForecasts(yesterday);
  if (priorForecasts.length === 0) {
    console.log(`[score] ${yesterday}: no prior forecasts logged → skip (warm-up / missed run)`);
    return;
  }

  const scoredAt = new Date().toISOString();
  const rows: DailySkillRecord[] = [];
  for (const f of priorForecasts) {
    const s = scoreSourceDay({
      pop: f.pop,
      predicted_mm: f.predicted_mm,
      observed_mm: observation.observed_mm,
    });
    if (!s) continue; // missing forecast signal or correct-negative → skip (CSI semantics)
    rows.push({
      date: yesterday,
      source: f.source,
      region: REGION,
      pop: f.pop,
      predicted_mm: f.predicted_mm,
      observed_mm: observation.observed_mm,
      predicted_rain: s.predicted_rain,
      observed_rain: s.observed_rain,
      outcome: s.outcome,
      contingency: s.contingency,
      csi: s.csi,
      categorical_skill: s.categorical_skill,
      quantitative_skill: s.quantitative_skill,
      skill: s.skill,
      scoredAt,
    });
  }

  const written = await appendDailySkill(rows);
  console.log(
    `[score] ${yesterday}: scored ${rows.length}/${priorForecasts.length} source(s), +${written} new daily-skill row(s)`,
  );
  for (const r of rows) {
    const quant = r.quantitative_skill === null ? "—" : r.quantitative_skill.toFixed(2);
    console.log(
      `  ${r.source.padEnd(14)} ${r.outcome.padEnd(16)} csi=${r.csi} cat=${r.categorical_skill} quant=${quant} skill=${r.skill.toFixed(3)}`,
    );
  }
}

main().catch((err) => {
  console.error("[precip-reliability] fatal:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
