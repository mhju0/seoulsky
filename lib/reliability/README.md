# Precipitation source reliability

SeoulSky can learn bounded per-provider precipitation weights from completed Seoul forecasts. The scheduled job is separate from request handling; it never fabricates missing forecasts or observations, and it does not make the core site depend on the learning state.

## Daily pipeline

`npm run reliability:daily` runs `scripts/precip-reliability.ts`:

1. Collect tomorrow's daily precipitation forecast from every available provider and append one record per source to `forecast-log.jsonl`.
2. Fetch yesterday's completed KMA ASOS daily precipitation observation for station 108.
3. Join prior forecasts to that independent observation and append informative skill records to `daily-skill.jsonl`.
4. Apply unprocessed daily losses to the bounded multiplicative-weights state in `source-weights.json`.

Missing observation data, missing forecasts, and correct-dry days are skipped where they carry no useful scoring information. Repeated runs are idempotent by date and source.

## Scoring

- Measurable rain is at least `0.1 mm`.
- When a provider lacks a clean precipitation amount, rain/no-rain falls back to probability at the configured threshold.
- A miss is penalized more than a false alarm.
- Correct-dry days do not improve a source's weight.
- Quantitative amount error is scored only when rain occurred and the provider supplied an amount.
- Weights remain normalized and bounded by the floor and cap in `weights.ts`.

All thresholds and loss constants are named and unit-tested in `score.ts` and `weights.ts`.

## Runtime gate

The web runtime reads `source-weights.json` through the narrow `runtimeWeightsSource.ts -> weightsStore.ts` path. The gate behaves as follows:

- Missing, corrupt, stale, or insufficiently trained state uses equal fallback.
- Intermediate training linearly blends equal and learned weights.
- Fully warmed state uses the bounded learned weights.
- `MULTI_SOURCE_PRECIP` defaults to off. When off, `/api/sky` retains the Open-Meteo precipitation baseline.
- When enabled, sources fetch concurrently with a per-source timeout. Only returned values participate, and weights renormalize over the available subset.
- Missing precipitation values are excluded rather than converted to zero. If every optional source fails, the baseline remains unchanged.
- `RELIABILITY_DEBUG=1` adds non-secret weighting diagnostics to `/api/sky`; leave it unset in production unless actively investigating the model.

## Storage and automation

Runtime files live under `data/reliability/` and are ignored on `main`:

- `forecast-log.jsonl`
- `daily-skill.jsonl`
- `source-weights.json`

`.github/workflows/precip-reliability.yml` runs daily and can also be dispatched manually. It restores and persists only those state files on the orphan `reliability-state` branch. The workflow serializes runs to avoid competing updates. Repository secrets are mapped into the job environment; they must never be committed to the state branch.

Scoring requires `KMA_OBSERVATION_API_KEY` for the KMA ASOS daily service. `KMA_SHORT_TERM_API_KEY` is only a fallback and may not have the required subscription. A missing or unauthorized observation key causes a scoring skip, not fabricated ground truth.

Before relying on learned production weights, personally verify the latest scheduled workflow and the state branch in GitHub. Local tests cannot prove that remote scheduling, secrets, or persistence are healthy.

## Files

| File | Responsibility |
| --- | --- |
| `forecastLog.ts` | Normalize provider forecasts for logging |
| `groundTruth.ts` | Fetch KMA ASOS completed observations |
| `score.ts` | Pure daily skill calculation |
| `weights.ts` | Pure bounded multiplicative-weight update |
| `runtimeWeights.ts` | Pure warm-up, staleness, and effective-weight gate |
| `forecastSources.ts` | Single-flight, TTL-cached provider fan-out with timeouts |
| `store.ts` | Idempotent JSONL and JSON batch persistence |
| `weightsStore.ts` | Narrow, never-throwing runtime state read |
| `scripts/precip-reliability.ts` | Daily orchestration |
