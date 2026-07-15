import type { DailySkillRecord, ForecastRecord, WeightsState } from "./types.ts";

export interface ReliabilitySnapshot {
  forecasts: ForecastRecord[];
  dailySkill: DailySkillRecord[];
  weights: WeightsState | null;
}

type DatedSourceRecord = { date: string; source: string };

export interface ReliabilityMonotonicOptions {
  /** Explicit recovery may repair corrupt rows and a reset-only weight timestamp. */
  allowContentRepair?: boolean;
}

interface WeightsRegressionOptions {
  allowTimestampRepair?: boolean;
}

function recordKey(record: DatedSourceRecord): string {
  return `${record.date}|${record.source}`;
}

function missingKeys<T extends DatedSourceRecord>(previous: readonly T[], candidate: readonly T[]): string[] {
  const candidateKeys = new Set(candidate.map(recordKey));
  return previous.map(recordKey).filter((key) => !candidateKeys.has(key));
}

function replacedKeys<T extends DatedSourceRecord>(previous: readonly T[], candidate: readonly T[]): string[] {
  const candidateByKey = new Map(candidate.map((record) => [recordKey(record), record]));
  return previous.flatMap((record) => {
    const key = recordKey(record);
    const next = candidateByKey.get(key);
    return next !== undefined && JSON.stringify(next) !== JSON.stringify(record) ? [key] : [];
  });
}

export function weightsStateRegressions(
  previous: WeightsState | null,
  candidate: WeightsState | null,
  options: WeightsRegressionOptions = {},
): string[] {
  if (!previous) return [];
  if (!candidate) return ["weight state is missing"];

  const regressions: string[] = [];
  if (
    !options.allowTimestampRepair &&
    Date.parse(candidate.updatedAt) < Date.parse(previous.updatedAt)
  ) {
    regressions.push(`weight state timestamp moved backward (${candidate.updatedAt} < ${previous.updatedAt})`);
  }
  if (candidate.eventsScored < previous.eventsScored) {
    regressions.push(
      `weight state eventsScored moved backward (${candidate.eventsScored} < ${previous.eventsScored})`,
    );
  }
  const previousWeightKeys = Object.keys(previous.weights).sort();
  const candidateWeightKeys = Object.keys(candidate.weights).sort();
  const sameWeightVector =
    previousWeightKeys.length === candidateWeightKeys.length &&
    previousWeightKeys.every(
      (source, index) =>
        source === candidateWeightKeys[index] && previous.weights[source] === candidate.weights[source],
    );
  if (candidate.eventsScored === previous.eventsScored && !sameWeightVector) {
    regressions.push("weight vector changed without new scored events");
  }

  const candidateDates = new Set(candidate.processedDates);
  const lostDates = previous.processedDates.filter((date) => !candidateDates.has(date));
  if (lostDates.length > 0) {
    regressions.push(`weight state lost ${lostDates.length} processed date(s): ${lostDates.join(", ")}`);
  }
  return regressions;
}

export function reliabilitySnapshotRegressions(
  previous: ReliabilitySnapshot,
  candidate: ReliabilitySnapshot,
  options: ReliabilityMonotonicOptions = {},
): string[] {
  const regressions: string[] = [];
  const missingForecasts = missingKeys(previous.forecasts, candidate.forecasts);
  if (candidate.forecasts.length < previous.forecasts.length) {
    regressions.push(
      `forecast history row count moved backward (${candidate.forecasts.length} < ${previous.forecasts.length})`,
    );
  }
  if (missingForecasts.length > 0) {
    regressions.push(`forecast history lost ${missingForecasts.length} row key(s): ${missingForecasts.join(", ")}`);
  }
  const replacedForecasts = options.allowContentRepair
    ? []
    : replacedKeys(previous.forecasts, candidate.forecasts);
  if (replacedForecasts.length > 0) {
    regressions.push(
      `forecast history replaced ${replacedForecasts.length} existing row(s): ${replacedForecasts.join(", ")}`,
    );
  }
  const missingSkill = missingKeys(previous.dailySkill, candidate.dailySkill);
  if (candidate.dailySkill.length < previous.dailySkill.length) {
    regressions.push(
      `daily-skill history row count moved backward (${candidate.dailySkill.length} < ${previous.dailySkill.length})`,
    );
  }
  if (missingSkill.length > 0) {
    regressions.push(`daily-skill history lost ${missingSkill.length} row key(s): ${missingSkill.join(", ")}`);
  }
  const replacedSkill = options.allowContentRepair
    ? []
    : replacedKeys(previous.dailySkill, candidate.dailySkill);
  if (replacedSkill.length > 0) {
    regressions.push(
      `daily-skill history replaced ${replacedSkill.length} existing row(s): ${replacedSkill.join(", ")}`,
    );
  }
  regressions.push(
    ...weightsStateRegressions(previous.weights, candidate.weights, {
      allowTimestampRepair: options.allowContentRepair,
    }),
  );
  return regressions;
}

export function assertReliabilitySnapshotMonotonic(
  previous: ReliabilitySnapshot,
  candidate: ReliabilitySnapshot,
  options: ReliabilityMonotonicOptions = {},
): void {
  const regressions = reliabilitySnapshotRegressions(previous, candidate, options);
  if (regressions.length > 0) {
    throw new Error(`Reliability state regression: ${regressions.join("; ")}`);
  }
}

function mergeRecords<T extends DatedSourceRecord>(
  preferred: readonly T[],
  additional: readonly T[],
): T[] {
  const byKey = new Map<string, T>();
  for (const record of [...preferred, ...additional]) {
    const key = recordKey(record);
    if (!byKey.has(key)) byKey.set(key, record);
  }
  return [...byKey.values()].sort(
    (left, right) => left.date.localeCompare(right.date) || left.source.localeCompare(right.source),
  );
}

function selectAdvancedWeights(
  preferred: WeightsState | null,
  additional: WeightsState | null,
): WeightsState | null {
  if (!preferred) return additional;
  if (!additional) return preferred;

  if (weightsStateRegressions(additional, preferred).length === 0) return preferred;
  if (weightsStateRegressions(preferred, additional).length === 0) return additional;

  // A state reset can write a fresh timestamp while discarding evidence. During
  // an explicit recovery, compare the durable evidence independently of that
  // timestamp so the checkpoint with more events and a superset of dates wins.
  if (
    weightsStateRegressions(additional, preferred, { allowTimestampRepair: true })
      .length === 0
  ) {
    return preferred;
  }
  if (
    weightsStateRegressions(preferred, additional, { allowTimestampRepair: true })
      .length === 0
  ) {
    return additional;
  }
  throw new Error(
    "Reliability recovery checkpoints are incomparable; refusing to guess which learned weights are authoritative",
  );
}

/**
 * Recovery union for an explicitly selected known-good snapshot and the current
 * branch snapshot. Conflicting row keys keep the known-good value, unique rows
 * from both survive, and only a checkpoint that monotonically dominates the
 * other may become the learned-weight base.
 */
export function mergeReliabilitySnapshots(
  preferred: ReliabilitySnapshot,
  additional: ReliabilitySnapshot,
): ReliabilitySnapshot {
  return {
    forecasts: mergeRecords(preferred.forecasts, additional.forecasts),
    dailySkill: mergeRecords(preferred.dailySkill, additional.dailySkill),
    weights: selectAdvancedWeights(preferred.weights, additional.weights),
  };
}
