# Precipitation source-reliability scoring

Per-source skill scoring for Seoul precipitation forecasts, learned by verifying
each weather source against independent ground truth. Built in phases so nothing
touches the live `/sky` render path until the scores are trustworthy.

- **Phase 1 — offline scoring** (logging, ground-truth fetch, per-source daily skill). ✅
- **Phase 2 — stateful weight update** (multiplicative-weights / Hedge). ✅
- **Phase 3 — gated runtime consumption** in the precip fusion (this commit). ✅

Phases 1–2 are offline only. Phase 3 consumes the weights in the `/sky` data path
but is **gated**: until the weights warm up it degrades to the **exact** pre-Phase-3
behavior. The live scene therefore stays in equal-fallback (byte-for-byte unchanged)
until `KMA_OBSERVATION_API_KEY` is active and ≥ `WARMUP_EVENTS` (5) informative
events accumulate.

---

## What the daily batch does

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
   with the observation and writes one record per source to `daily-skill.jsonl`
   (`outcome`, `mae`, the scalar `skill`, and the contingency/CSI breakdown). Days
   with a missing forecast or observation are skipped — no value is ever fabricated.
4. **Weight update (Phase 2)** — folds every not-yet-processed scored day into the
   persisted Hedge weights (`source-weights.json`). Idempotent and offline; see the
   Phase 2 section below.

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
  - `CSI = hits / (hits + misses + false_alarms)` — the correct-negatives cell
    (a `correct_dry` day: both forecast and observed dry) is excluded so dry
    stretches can't inflate a source's score. A pure `correct_dry` day produces
    **no** record (CSI undefined → skipped).
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
(manual-dispatch by default; uncomment the `schedule` block to run daily). Durable
cross-run persistence of the data files — the `.jsonl` logs and especially
`source-weights.json` (the Hedge state) — is a deployment choice; commit them back
to a data branch or use object storage. Artifacts alone don't carry state between
scheduled runs.

## Files

| File                                            | Role                                                        |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `score.ts` / `score.test.ts`                    | Pure verification + skill math (no I/O)                     |
| `weights.ts` / `weights.test.ts`                | Pure Hedge weight updater (Phase 2; no I/O)                 |
| `runtimeWeights.ts` / `runtimeWeights.test.ts`  | Pure Phase 3 gate + confidence ramp + effective weights     |
| `runtimeWeightsSource.ts`                       | Memoized, never-throwing server read of `source-weights.json` |
| `types.ts`                                      | Record/score/weight shapes                                  |
| `constants.ts`                                  | `REGION` ("seoul")                                          |
| `forecastLog.ts`                                | Reads the live provider registry → `ForecastRecord[]`       |
| `groundTruth.ts`                                | KMA ASOS observed daily precip (independent truth)          |
| `store.ts`                                      | JSONL logs + `source-weights.json` (idempotent persistence) |
| `scripts/precip-reliability.ts`                 | The daily orchestrator (log → truth → score → weights)      |

Pipeline touch-points (additive, behavior-preserving for `/sky`): an optional
`precipitationAmount` field on `DailyForecast`, populated by Open-Meteo and
WeatherAPI; `.ts` import extensions on the providers + registry so the standalone
`node` script can load them (matching `kma.ts`'s existing style); the scorer's
emit gained `outcome` + `mae` (Phase 2); and Phase 3 added `fuseWeightedPrecip` /
`reweightForecastPrecip` to `lib/skyFusion.ts`, an optional debug-only
`precipWeighting` field on `SkySnapshot`, and the gated read in `app/api/sky/route.ts`.

---

## Phase 2 — Hedge weight update (this commit)

Turn the daily skills into a stateful, bounded per-source weight with a fast
multiplicative-weights (Hedge) updater — **not** the slow EWMA originally sketched
here. Still offline; nothing is consumed by the runtime.

Per scored day, per source, a **loss** is derived from the contingency outcome
(the knob surface — all named, tunable constants in `weights.ts`):

| Outcome (observed vs forecast) | Loss                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| `miss` (rain, forecast dry)    | `MISS_LOSS` = 1.0                                            |
| `false_alarm` (dry, forecast rain) | `FA_LOSS` = 0.6                                          |
| `hit` (both rain)              | `HIT_BASE_LOSS` (0.1) + `HIT_MAE_WEIGHT` (0.4) · min(1, mae / `MAE_SCALE` (10 mm)), the amount term only when the source supplied an amount |
| `correct_dry` (both dry)       | **no update** — dry-correct days must not move weights      |

**Update rule:** `weight_i *= exp(−ETA · loss_i)` with **ETA = 0.5** (`DEFAULT_ETA`,
overridable via `RELIABILITY_ETA`); renormalize to sum 1, hold each in
**[W_FLOOR = 0.05, W_CAP = 0.60]**, renormalize (iterated to a fixed point so a
capped weight can't drift back over the cap). Days are applied in **chronological
order**; cold start is **equal weights** over the existing 5 providers.

**Statefulness — both load-bearing:**

- **Idempotency:** `WeightsState.processedDates` records every applied daily-skill
  date; re-running never double-applies a day.
- **Persistence:** state lives in `data/reliability/source-weights.json`
  (`{ updatedAt, eventsScored, processedDates, weights }`). **This file is the
  algorithm's only memory and MUST survive across scheduled runs** — commit it back
  to a data branch, or store it in object storage / a KV store. The Phase 1
  artifact-upload does **not** carry state between runs; do not assume local disk
  persists. `eventsScored` is maintained for Phase 3's warm-up gate but nothing is
  gated on it here.

Unit-tested in `weights.test.ts`: repeated misses monotonically down-weight a
source (to the floor); a `correct_dry` day is a zero-change no-op; a miss
down-weights strictly more than a false alarm at equal η; weights always sum to ~1
and respect the floor/cap; re-applying a date is idempotent.

Possible later accuracy work (not required): KMA range-midpoint `predicted_mm`,
MET block-summing, η / loss calibration, and a note on KMA-forecast-vs-KMA-
observation self-correlation.

## Phase 3 — gated runtime consumption (this commit)

The fusion layer now consumes the learned weights — **precipitation fields ONLY**
(POP / predicted_mm), gated so that a missing/cold weights file leaves the live
scene byte-for-byte unchanged. The #1 contract is behavior preservation when the
gate is not met (the normal state today).

**Where & how (minimal, additive):**

- `lib/reliability/runtimeWeightsSource.ts` reads `source-weights.json`
  **server-side at the fusion layer**, memoized via the shared TTL cache (read ≤
  once per `CACHE_TTL_MS`, never per render/frame), and **never throws** into the
  render path (returns null on a missing/unparseable file).
- `lib/reliability/runtimeWeights.ts` (pure) gates it. Config block:
  `STALE_DAYS` 7, `WARMUP_EVENTS` 5, `FULL_CONFIDENCE_EVENTS` 20.
- `lib/skyFusion.ts` `fuseWeightedPrecip` / `reweightForecastPrecip` apply the
  effective weights to the forecast POP / predicted_mm. Temperature and every
  non-precip field are fused exactly as before, and `chooseCurrent` (the
  observation-based CURRENT conditions) is intentionally **not** weighted — the
  learned weights rank FORECAST skill, not the KMA observation (ground truth).
- `app/api/sky/route.ts` wires it in. The live scene supplies a single forecast
  source (Open-Meteo), so the weighted consensus is the **identity** today; it only
  begins to blend once multiple forecast sources feed the fusion.

**Degrade-to-equal (the rock-solid default)** — effective weights become EQUAL
(⇒ byte-for-byte pre-Phase-3 output) whenever:

- the weights file is missing or unparseable,
- it is stale (`updatedAt` older than `STALE_DAYS`) — cron presumed dead, or
- it is pre-warm-up (`eventsScored < WARMUP_EVENTS`).

**Confidence ramp** (no visible pop when crossing the threshold — condition flips
the landmark visuals): `confidence = clamp01((eventsScored − WARMUP_EVENTS) /
(FULL_CONFIDENCE_EVENTS − WARMUP_EVENTS))`, and
`effective = lerp(equalWeights, learnedWeights, confidence)`. Below `WARMUP_EVENTS`
→ pure equal; at/above `FULL_CONFIDENCE_EVENTS` → fully learned.

**Observability (debug only):** with `RELIABILITY_DEBUG=1` the `/api/sky` payload
carries `precipWeighting: { mode, reason, confidence }`
(`'equal-fallback' | 'ramping' | 'learned'`). Off in production, so the public
payload is unchanged. No UI / render component is touched.

**Live status:** with no `source-weights.json` present (today's real state), the gate
is `equal-fallback` / `no-weights-file` and the fused forecast is identical to
pre-Phase-3 — verified by unit tests and an `/api/sky` smoke test.
