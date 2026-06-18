# Precipitation source-reliability scoring

Per-source skill scoring for Seoul precipitation forecasts, learned by verifying
each weather source against independent ground truth. Built in phases so nothing
touches the live `/sky` render path until the scores are trustworthy.

**Phase 1 (this commit) is offline only — logging, ground-truth fetch, and
scoring.** No weight is consumed by the runtime pipeline yet, and the `/sky`
render path is untouched.

---

## What Phase 1 does

A standalone daily batch (`scripts/precip-reliability.ts`, runnable via cron or a
GitHub Action — never at request time, no runtime AI calls). Each run:

1. **Forecast log** — captures every *live* source's daily precipitation forecast
   for **tomorrow** and appends it to `forecast-log.jsonl`. Sources come straight
   from the existing 5-source pipeline (`lib/providers/registry.ts`) — no new
   providers, no parallel upstream calls. Schema: `{date, source, region, pop,
   predicted_mm}` (+ `loggedAt` provenance).
2. **Ground truth** — fetches KMA **ASOS observed** daily precipitation (일강수량,
   station 108) for **yesterday** (a completed day). This observation is the
   independent truth and is **never** one of the scored forecast sources, even
   though KMA's *forecast* may be a source.
3. **Verification + daily skill** — joins yesterday's previously-logged forecasts
   with the observation and writes one daily skill per source to
   `daily-skill.jsonl`. Days with a missing forecast or observation are skipped —
   no value is ever fabricated.

The first scores appear once a target day has **both** a prior-logged forecast
and an observation (≥2 consecutive run days). This warm-up is real, not backfilled.

### Why "tomorrow" then "yesterday"?
A forecast for day _D_ is logged on _D−1_ (a consistent ~1-day lead); _D_'s
observation is fetched on _D+1_; _D_ is scored on _D+1_. One run does all three
steps for its three respective dates.

## The scoring (pure, unit-tested in `score.ts` / `score.test.ts`)

For each source on a completed day:

- **Categorical (rain / no-rain)** via a contingency table. Rain is "measurable"
  precipitation, `≥ RAIN_THRESHOLD_MM` (0.1 mm). A source's predicted-rain uses
  its `predicted_mm` when present, else `pop ≥ POP_RAIN_THRESHOLD` (50%).
  - `CSI = hits / (hits + misses + false_alarms)` — correct-negatives (dry days)
    are excluded so dry stretches can't inflate a source's score. A pure
    correct-negative day produces **no** record (CSI undefined → skipped).
  - **Asymmetric penalty:** a miss (unforecast rain) is penalized more than a
    false alarm. `categorical_skill`: hit → 1, false alarm → 0.5, miss → 0
    (`MISS_PENALTY` 1.0 vs `FALSE_ALARM_PENALTY` 0.5).
- **Quantitative amount error** — `MAE = |predicted_mm − observed_mm|`, mapped to
  `quantitative_skill = clamp01(1 − MAE / QUANT_SCALE_MM)` (20 mm → 0). Computed
  **only on days it actually rained** and only when the source supplied an amount.
- **Combined daily skill ∈ [0,1]** — `CATEGORICAL_WEIGHT` (0.6) × categorical +
  0.4 × quantitative, falling back to whichever term is defined.

Every threshold/weight is a named constant in `score.ts` for Phase 2 calibration.

## `predicted_mm` coverage (honest gaps)

The normalized pipeline only exposes a clean daily precipitation **amount** for
some sources, so `predicted_mm` is populated where it is trustworthy and `null`
otherwise (no lossy range-parsing, no fabrication):

| Source        | `pop` | `predicted_mm` | Notes                                            |
| ------------- | :---: | :------------: | ------------------------------------------------ |
| Open-Meteo    |  yes  |      yes       | `precipitation_sum` (added to the daily request) |
| WeatherAPI    |  yes  |      yes       | `day.totalprecip_mm`                             |
| KMA (forecast)|  yes  |      null      | 단기예보 PCP is range-coded ("1.0~4.0mm") — not parsed |
| Pirate Weather|  yes  |      null      | daily block has no clean liquid mm total         |
| MET Norway    |  null |      null      | POP not published outside the Nordics            |

Sources without `predicted_mm` are still fully scored **categorically** (via POP);
their quantitative term is simply skipped. Adding range-midpoint parsing (KMA) or
block-summing (MET) is a future option, noted below.

## Running it

```bash
npm run reliability:daily
# = node --env-file-if-exists=.env.local --env-file-if-exists=.env scripts/precip-reliability.ts
```

- **Zero keys still works**: Open-Meteo logs forecasts unconditionally. Other
  forecast sources activate only when their keys are set. Ground truth needs a
  key (below); without it, scoring is skipped — never invented.
- **Ground-truth key**: `KMA_OBSERVATION_API_KEY` — a **separate** data.go.kr
  활용신청 for *기상청_지상(종관, ASOS) 일자료 조회서비스* (`AsosDalyInfoService`).
  Falls back to `KMA_SHORT_TERM_API_KEY`, but the short-term subscription does
  **not** cover ASOS (returns HTTP 403), so a dedicated subscription is needed to
  enable scoring.
- **Output dir**: `./data/reliability` by default (git-ignored); override with
  `RELIABILITY_DATA_DIR` to point cron/CI at durable storage.

An example scheduler lives in `.github/workflows/precip-reliability.yml`
(manual-dispatch by default; uncomment the `schedule` block to run daily). Note
that durable cross-run persistence of the `.jsonl` files (commit-back to a data
branch, or object storage) is a deployment choice — artifacts alone don't carry
state between scheduled runs.

## Files

| File                              | Role                                                      |
| --------------------------------- | --------------------------------------------------------- |
| `score.ts` / `score.test.ts`      | Pure verification + skill math (no I/O)                   |
| `types.ts`                        | Record/score shapes                                       |
| `constants.ts`                    | `REGION` ("seoul")                                        |
| `forecastLog.ts`                  | Reads the live provider registry → `ForecastRecord[]`     |
| `groundTruth.ts`                  | KMA ASOS observed daily precip (independent truth)        |
| `store.ts`                        | Append-only JSONL persistence (idempotent per date+source)|
| `scripts/precip-reliability.ts`   | The daily orchestrator                                    |

Pipeline touch-points (additive, behavior-preserving for `/sky`): an optional
`precipitationAmount` field on `DailyForecast`, populated by Open-Meteo and
WeatherAPI; and `.ts` import extensions on the providers + registry so the
standalone `node` script can load them (matching `kma.ts`'s existing style).

---

## Phase 2 — EWMA weight update (NOT in this commit)

Turn the daily skills into a smoothed, bounded per-source weight, still offline.

- Read `daily-skill.jsonl`; per source maintain an exponentially-weighted moving
  average: `w ← (1 − ALPHA)·w + ALPHA·skill`, **ALPHA ≈ 0.05** (slow, stable).
- **Clamp each weight to [0.05, 0.60]** — no source is ever fully trusted or fully
  silenced.
- **14-day warm-up**: keep weights at a neutral default until a source has ≥14
  scored days; don't let a handful of early days swing the weights.
- Write to a **new** weights file (e.g. `weights.json`). Phase 2 still does **not**
  let the runtime read it.
- Decide durable persistence for the JSONL/weights across scheduled runs.
- Optional accuracy work: KMA range-midpoint `predicted_mm`, MET block-summing,
  threshold/weight calibration, and a note on KMA-forecast-vs-KMA-observation
  self-correlation.

## Phase 3 — runtime consumption (NOT in this commit)

Let the fusion layer use the weights, carefully and reversibly.

- `lib/skyFusion.ts` (and/or `/api/sky`) reads `weights.json` to bias precipitation
  fusion toward historically-reliable sources — behind a flag, defaulting off.
- Strictly degrade to today's behavior when weights are missing/stale/out of
  warm-up, so the keyless-first guarantee and the scene's never-break contract hold.
- This is the first phase that touches the `/sky` data path; gate and test it
  before enabling.
