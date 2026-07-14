import { REGION } from "./constants.ts";
import { scoreSourceDay } from "./score.ts";
import type {
  DailySkillRecord,
  ForecastRecord,
  ObservationRecord,
  WeightsState,
} from "./types.ts";
import { applyUnprocessed, initialWeightsState } from "./weights.ts";

const DAY_MS = 86_400_000;
const seoulYmd = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export interface ReliabilityCycleStore {
  appendForecasts(records: readonly ForecastRecord[]): Promise<number>;
  readForecasts(date: string): Promise<ForecastRecord[]>;
  appendDailySkill(records: readonly DailySkillRecord[]): Promise<number>;
  readDailySkill(): Promise<DailySkillRecord[]>;
  readWeights(): Promise<WeightsState | null>;
  writeWeights(state: WeightsState): Promise<void>;
}

export interface ReliabilityCycleDependencies {
  now(): Date;
  sourceIds: readonly string[];
  store: ReliabilityCycleStore;
  collectForecasts(targetDate: string, now: Date): Promise<ForecastRecord[]>;
  fetchObservation(date: string): Promise<ObservationRecord | null>;
  eta?: number;
}

export interface ReliabilityCycleResult {
  runAt: string;
  forecast: {
    date: string;
    records: ForecastRecord[];
    appended: number;
  };
  scoring: {
    date: string;
    observation: ObservationRecord | null;
    priorForecasts: number;
    records: DailySkillRecord[];
    appended: number;
  };
  weighting: {
    state: WeightsState;
    newlyAppliedDates: number;
    written: boolean;
  };
}

function seoulDate(offsetDays: number, base: Date): string {
  return seoulYmd.format(new Date(base.getTime() + offsetDays * DAY_MS));
}

function scoreForecasts(
  forecasts: readonly ForecastRecord[],
  observation: ObservationRecord,
  scoredAt: string,
): DailySkillRecord[] {
  const records: DailySkillRecord[] = [];
  for (const forecast of forecasts) {
    const score = scoreSourceDay({
      pop: forecast.pop,
      predicted_mm: forecast.predicted_mm,
      observed_mm: observation.observed_mm,
    });
    if (!score) continue;
    records.push({
      date: observation.date,
      source: forecast.source,
      region: REGION,
      pop: forecast.pop,
      predicted_mm: forecast.predicted_mm,
      observed_mm: observation.observed_mm,
      predicted_rain: score.predicted_rain,
      observed_rain: score.observed_rain,
      outcome: score.outcome,
      contingency: score.contingency,
      csi: score.csi,
      categorical_skill: score.categorical_skill,
      quantitative_skill: score.quantitative_skill,
      mae: score.mae,
      skill: score.skill,
      scoredAt,
    });
  }
  return records;
}

/**
 * Execute one complete log → truth → score → learn cycle through injected
 * provider and persistence boundaries. The CLI and tests both call this seam;
 * network, filesystem, environment, logging, and process exit stay adapters.
 */
export async function runReliabilityCycle(
  dependencies: ReliabilityCycleDependencies,
): Promise<ReliabilityCycleResult> {
  const now = dependencies.now();
  const tomorrow = seoulDate(1, now);
  const yesterday = seoulDate(-1, now);

  const forecasts = await dependencies.collectForecasts(tomorrow, now);
  const forecastsAppended = await dependencies.store.appendForecasts(forecasts);

  const observation = await dependencies.fetchObservation(yesterday);
  const priorForecasts = observation ? await dependencies.store.readForecasts(yesterday) : [];
  const skillRecords = observation ? scoreForecasts(priorForecasts, observation, now.toISOString()) : [];
  const skillAppended = await dependencies.store.appendDailySkill(skillRecords);

  const allSkill = await dependencies.store.readDailySkill();
  const priorState = await dependencies.store.readWeights();
  const base = priorState ?? initialWeightsState(dependencies.sourceIds, now);
  const next = applyUnprocessed(base, allSkill, { eta: dependencies.eta, now });
  const newlyAppliedDates = next.processedDates.length - base.processedDates.length;
  // `updatedAt` is also the runtime health checkpoint. Refresh it after a
  // successful independent observation even when the day is correctly dry or
  // no prior forecast exists; a missing observation deliberately does not keep
  // learned weights fresh forever.
  const written = newlyAppliedDates > 0 || priorState === null || observation !== null;
  if (written) await dependencies.store.writeWeights(next);

  return {
    runAt: now.toISOString(),
    forecast: { date: tomorrow, records: forecasts, appended: forecastsAppended },
    scoring: {
      date: yesterday,
      observation,
      priorForecasts: priorForecasts.length,
      records: skillRecords,
      appended: skillAppended,
    },
    weighting: { state: next, newlyAppliedDates, written },
  };
}
