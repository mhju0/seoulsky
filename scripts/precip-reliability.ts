/**
 * Daily precipitation source-reliability batch.
 *   Phase 1: log forecasts + fetch ground truth + score each source.
 *   Phase 2: fold the scores into stateful per-source Hedge weights.
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
 *   3. scores yesterday by joining its previously-logged forecasts with the truth,
 *   4. updates source-weights.json from every not-yet-processed scored day.
 *
 * The weight update is offline only — Phase 2 does NOT wire weights into the
 * runtime pipeline and does NOT touch the /sky render path (that is Phase 3).
 * source-weights.json is the updater's only memory and MUST persist across runs
 * (see lib/reliability/README.md). Missing data is skipped, never invented.
 */
import { providers } from "../lib/providers/registry.ts";
import { REGION } from "../lib/reliability/constants.ts";
import { collectForecasts } from "../lib/reliability/forecastLog.ts";
import { fetchObservedPrecip } from "../lib/reliability/groundTruth.ts";
import { scoreSourceDay } from "../lib/reliability/score.ts";
import {
  appendDailySkill,
  appendForecasts,
  readDailySkill,
  readForecasts,
  readWeights,
  reliabilityDataDir,
  writeWeights,
} from "../lib/reliability/persistence.ts";
import type { DailySkillRecord } from "../lib/reliability/types.ts";
import { applyUnprocessed, initialWeightsState, resolveEta } from "../lib/reliability/weights.ts";

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

/** Steps 2–3: fetch yesterday's ground truth and score it (appends daily-skill). */
async function scoreCompletedDay(date: string): Promise<void> {
  const observation = await fetchObservedPrecip(date);
  if (!observation) {
    console.log(`[truth] ${date}: no observation available → skip scoring (no fabrication)`);
    return;
  }
  console.log(`[truth] ${date}: observed ${observation.observed_mm} mm (KMA ASOS, station 108)`);

  const priorForecasts = await readForecasts(date);
  if (priorForecasts.length === 0) {
    console.log(`[score] ${date}: no prior forecasts logged → skip (warm-up / missed run)`);
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
    if (!s) continue; // missing forecast signal or correct-dry → skip (CSI semantics)
    rows.push({
      date,
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
      mae: s.mae,
      skill: s.skill,
      scoredAt,
    });
  }

  const written = await appendDailySkill(rows);
  console.log(
    `[score] ${date}: scored ${rows.length}/${priorForecasts.length} source(s), +${written} new daily-skill row(s)`,
  );
  for (const r of rows) {
    const quant = r.quantitative_skill === null ? "—" : r.quantitative_skill.toFixed(2);
    console.log(
      `  ${r.source.padEnd(14)} ${r.outcome.padEnd(16)} csi=${r.csi} skill=${r.skill.toFixed(3)} (cat=${r.categorical_skill} quant=${quant})`,
    );
  }
}

/** Step 4: fold every unprocessed scored day into the persisted Hedge weights. */
async function updateWeights(now: Date): Promise<void> {
  const allSkill = await readDailySkill();
  const priorState = await readWeights();
  const eta = resolveEta();
  const base = priorState ?? initialWeightsState(providers.map((p) => p.id), now);
  const next = applyUnprocessed(base, allSkill, { eta, now: new Date() });

  const newlyApplied = next.processedDates.length - base.processedDates.length;
  // Persist when something changed, or to establish the cold-start file once.
  if (newlyApplied > 0 || priorState === null) await writeWeights(next);

  console.log(
    `[weights] η=${eta} eventsScored=${next.eventsScored} processedDates=${next.processedDates.length} (+${newlyApplied})`,
  );
  for (const [source, w] of Object.entries(next.weights)) {
    console.log(`  ${source.padEnd(14)} ${w.toFixed(4)}`);
  }
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

  // 2–3) Ground truth + score yesterday.
  await scoreCompletedDay(yesterday);

  // 4) Hedge weight update — always runs (folds any prior unprocessed scored days).
  await updateWeights(now);
}

main().catch((err) => {
  console.error("[precip-reliability] fatal:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
