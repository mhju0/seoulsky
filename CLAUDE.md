# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SeoulSky is a **Seoul-only, cinematic real-time weather experience** — not a dashboard. The whole product lives at a single route, `/sky`: one continuous, non-navigating page where a persistent atmospheric background (a colour-graded still landmark plate + live weather FX, with a procedural fallback) sits behind a HUD with two keyboard-toggled views. Time of day and weather are always computed for **Asia/Seoul**, regardless of where the viewer is.

It runs with **zero API keys** for the core scene (Open-Meteo + RainViewer baseline); official sources (KMA, AirKorea, MET Norway, Pirate Weather, WeatherAPI) are *optional enrichment* and every one of them degrades silently to `null`/`[]` when unconfigured or failing — the scene never breaks for a missing key. The **one feature with a meaningful key dependency is the radar echo imagery** (`KMA_APIHUB_KEY`): without it the radar section still renders its basemap + labels but shows no precipitation frames. Everything else, including the radar *approach signal*, stays keyless.

> **The README.md is partially stale.** It describes a retired React-Three-Fiber "flying through clouds" home at `/` plus a separate `/diagnostics` deck. That architecture is gone. Today `/`, `/atmosphere`, and `/diagnostics` are all redirects to `/sky` (see `next.config.ts` + `app/page.tsx`), there is **no `three`/`@react-three/fiber` dependency**, and the diagnostics content is folded into a section of the `/sky` scroll. Trust the code and `next.config.ts` over the README's "화면 구성"/"아키텍처" sections. The README is still accurate on data sources, fusion rules, and the keyless-first philosophy.

## Tech stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript 5** (strict)
- **Tailwind CSS v4** via `@tailwindcss/postcss` — config-less; `app/globals.css` uses `@import "tailwindcss"` + `@theme inline`. Most of the visual system is hand-written CSS in `globals.css` (the `.sky-*` classes), not utility soup.
- **framer-motion** (scroll reveals, `useInView`-gated lazy fetch). [Verified] `recharts` is still in `package.json` but **unused** (0 imports) — its only consumer, the Sun & Sky wind chart, was removed in `91a61a4`; the dep is safe to drop.
- The WebGL background is **hand-rolled raw WebGL** (`components/atmosphere/AtmosphericFieldBackground.tsx`, a single fullscreen shader driven by mutable refs), dynamically imported with `ssr: false`. Despite ESLint comments mentioning react-three-fiber, three.js is not a dependency.

## Commands

```bash
npm run dev                 # Next dev server → http://localhost:3000 (no env vars needed)
npm run build && npm start  # production build + serve
npm run lint                # ESLint (flat config, eslint.config.mjs)
npx tsc --noEmit            # type check (tsc is noEmit-only; Next does the building)
npm test                    # all unit tests: node --test "lib/**/*.test.ts"
```

Single test / filtered run:

```bash
node --test lib/skyFusion.test.ts                              # one file
node --test --test-name-pattern="KMA temperature" "lib/**/*.test.ts"   # by test name
```

**Node version matters.** Tests run `.ts` files directly through Node's **built-in TypeScript type-stripping** (no jest, no ts-node, no build step) plus glob support in `--test`. Use **Node ≥ 22** (this repo is developed on Node 24). The README's "Node 20" is not sufficient to run the test command. A `MODULE_TYPELESS_PACKAGE_JSON` warning during `npm test` is harmless (package.json has no `"type": "module"`).

## Architecture & data flow

### Routes
- `app/page.tsx` — redirects `/` → `/sky`. `next.config.ts` redirects `/atmosphere` and `/diagnostics` → `/sky` as real HTTP redirects (work without JS).
- `app/sky/layout.tsx` — server component. Renders `WeatherExperienceShell` (the whole client experience) and a static `<noscript>` fallback (the only meaningful SSR HTML for crawlers / no-JS).
- `app/sky/page.tsx` — renders `SkyView`, the HUD foreground.
- `app/api/sky/route.ts` — **GET `/api/sky`**: the lean fused `SkySnapshot` that drives the live scene. Open-Meteo baseline + optional KMA/air/radar/warnings, fused per documented rules. Works with zero keys.
- `app/api/weather/route.ts` — **GET `/api/weather`**: the heavy `WeatherIntelligence` (5-provider cross-validation, confidence + comparison, environment sources, cache diagnostics). Deliberately separate from `/api/sky` so the scene stays fast. Consumed only by the Ground Station section.
- `app/api/weather/radar/route.ts` — RainViewer radar **approach-signal** summary (feeds the "비구름 접근" headline; diagnostics/debug). RainViewer is now *approach-signal only* — the displayed radar **imagery** moved to KMA (see *Radar imagery* below).
- `app/api/radar/frames/route.ts` — **GET `/api/radar/frames`**: the KMA radar frame timeline (~1 h / 13 frames, KST 5-min buckets) plus the echo's lat/lon `bounds`. No key and no grid ever leave the server.
- `app/api/radar/frame/route.ts` — **GET `/api/radar/frame?t=<KST yyyyMMddHHmm>`**: streams the server-rendered Seoul-metro echo PNG for one frame (immutable, cached per `tm`).

### The single shell (`components/atmosphere/WeatherExperienceShell.tsx`)
This is the heart. It is created once in the layout and never remounts (the page never navigates). It owns:
- **One** `useLiveSeoulWeather()` fetch — polls `/api/sky` every ~12 min, refreshes on tab-visible/focus only when data is stale (>5 min), de-dupes in-flight requests, and keeps the last good snapshot on failure (the scene never blanks).
- `useSeoulClock()` — the per-second clock.
- Client-only capability detection (quality tier, WebGL support, `prefers-reduced-motion`, fine pointer) run post-mount to avoid hydration mismatch.
- The sun phase + visual target, recomputed on a **coarse ~30s tick + every weather refresh** (not per second).
- The **D / Esc** keyboard toggle between the two views (desktop only; ignores typing targets and modifier/repeat keys).
- Pausing the scene whenever the tab is hidden **or** the data view is up.

**Re-render granularity is deliberate — respect it.** State is split across contexts (`WeatherFieldContext.tsx`) so the heavy scene doesn't re-render every second:
- `WeatherFieldProvider` — coarse state (snapshot, clamped visual `target`, sun factors `isDay/dayFactor/goldenFactor/rising/elevation`). The memoized `SceneStage` and most sections read **only** this.
- `WeatherClockProvider` — the per-second `Date`. Only components that display ticking time subscribe.
- `WeatherViewProvider` — `"hero" | "data"`.
- `SkyImageProvider` (`scene/SkyImageContext.tsx`) — selects/preloads/grades the still plate.

Do **not** move per-second values into the field context; that would re-render the scene every tick.

### The persistent scene (`components/atmosphere/scene/SceneStage.tsx`)
Memoized, fixed, `z-0`, edge-to-edge. Back-to-front, with a guaranteed never-blank fallback chain:
1. **Procedural atmospheric field** — `AtmosphericFieldBackground` (raw WebGL) wrapped in an error boundary; falls back to `AtmosphericFieldFallback` (pure CSS) if WebGL is unavailable or the GL context throws. It pauses when a still plate fully covers it (or the tab is hidden).
2. **`ImageField`** — the still landmark "atmospheric color field" plate (`object-fit: cover`), cross-dissolving on condition/anchor change, with a continuous sun-phase grade overlaid (`buildImageGrade`). A plate that 404s (not yet generated) silently resolves to `null` → the procedural field shows. Each slot may list **multiple variant srcs** (base + `__v2`/`__v3`); the loader picks one **deterministically per Seoul calendar day** so the choice is SSR-stable (no hydration mismatch) and rotates day-to-day. See `skyImageField.ts` + `public/sky/manifest.json`.
3. **`FXOverlay`** — live weather FX (rain/snow/lightning/fog/god-rays) driven by the clamped visual `target`.

### The HUD (`components/atmosphere/SkyView.tsx`)
Two always-mounted layers cross-fade on the D-toggle (~500ms; no scroll-coupled opacity):
- **Hero** — `ArrivalSection` (de-glassed readout over the live scene) + a "press D" hint.
- **Data** — a scrolling dashboard with its own opaque day/night gradient backdrop (so the scene pauses behind it): `InstrumentsSection` → `RadarSection` (section 03) → `ForecastSection` → `GroundStationSection`. ([Verified] 4 sections — `SkyView.tsx`. The former `SunSkySection` / Sun & Wind block was removed in `91a61a4`, which is why `recharts` is now unused.)

The day/night palette is applied **once** as CSS variables on the `.sky-foreground` root via `buildSkyPalette` (`lib/cinematic/skyPalette.ts`); it also remaps Tailwind's `white` so existing `text-white/*` becomes the correct ink for the current sky. Note: the data view's text was flattened to **full-strength adaptive ink across the board** (the prior `text-white/NN` opacity hierarchy was removed) — keep new data-view text on the adaptive `text-white` token, never a hardcoded colour, so it still flips correctly on dark backdrops.

### Radar imagery (`/sky` section 03 — KMA 500m reflectivity, server-rendered)
The displayed radar is KMA's **raw reflectivity grid** (apihub.kma.go.kr), rendered server-side into a Seoul-metro precip overlay on a dark CARTO basemap. This replaced the old low-res data.go.kr `getCmpImg` PNG (and, before that, a RainViewer/CARTO tile mosaic that broke when RainViewer capped free tiles at zoom 7 while the app requested 9).

**Server pipeline (the `KMA_APIHUB_KEY` and the 13 MB grid never reach the client):**
1. Resolve `tm` — KST 5-min bucket, **7-min publish lag** (reused timeline math in `kma.ts`). `tm` is required by KMA; omitting it returns "no data", not the latest.
2. Fetch the frame grid: `nph-rdr_cmp1_api?cmp=HSR&qcd=MSK&obs=ECHO&map=HB&disp=B&tm=…` → int16 **little-endian**, value = `dBZ×100`, full national grid **2305×2881** (Lambert Conformal Conic).
3. Parse → crop the fixed Seoul window (ix 1206–1353 × iy 1508–1649; **flip south→north**, since `iy=0` is south).
4. **Reproject to Web Mercator** using the per-cell latlon (affine inverse + bilinear sampling) — this both registers the echo to the Mercator basemap *and* smooths the 500 m cells.
5. dBZ → RGBA ramp; sentinels → fully transparent; hand-rolled PNG via `node:zlib` (zero new deps) → cache per `tm` (immutable, cache-forever).
   - The latlon grid (`nph-rdr_latlon_api`, `lon` + `lat`) is fetched **once** and cached to `data/radar/geo-HSR.json` (gitignored).

**Client:** a static CARTO **`dark_nolabels`** tile mosaic (~z10, ~76 km square) + the georeferenced echo PNG placed on the frame's lat/lon `bounds` (same Mercator projection → registers by construction) + **hand-placed Korean `CITY_LABELS`**. (CARTO `dark_all` romanizes Korean names — "Incheon", "NAMYANGJU" — so labels are ours, not the basemap's.)

**No-echo is correct, not a bug.** The grid is pure reflectivity. Sentinels render fully transparent: `-30000` (outside coverage), `-25000` (in-coverage, no echo), `-20100` (clutter). When it's dry over Seoul the echo layer is empty and you see only the basemap + labels — the radar only shows colour during precipitation. **Do not "fix" an empty radar.**

**The headline stays independent.** The "Now over Seoul · 서울 상공" approach text reads the RainViewer-derived `snapshot.radar` (zoom 6, which never hit the zoom-7 wall). Do **not** route it through the KMA grid pipeline.

**Key files:** `lib/radar/grid.ts` (disp=B decode, crop, flip, sentinels, dBZ→RGBA ramp, PNG encode), `lib/radar/geo.ts` (latlon parse, affine fit, Mercator reproject), `lib/radar/mercator.ts` (pure Mercator helpers, shared server+client), `lib/radar/apihub.ts` (**server-only** net layer + `renderFrame(tm)` + geo disk cache), `lib/radar/kma.ts` (frame timeline only — KST buckets, 7-min lag), `lib/radar/config.ts` (`BASEMAP`, `CITY_LABELS`, `RADAR_LEGEND`), `app/api/radar/{frame,frames}/route.ts`, `components/atmosphere/sections/RadarSection.tsx`.

**Open caveat:** echo↔basemap registration is validated by construction + KMA latlon ground truth (~190 m / 0.38-cell affine residual), but **not yet eyeballed against live echo over Seoul** (dry at build time). Confirm a rain band lands on the right rivers/coastline next time there's precipitation.

### Data fusion (`lib/skyFusion.ts`, `lib/providers/*`)
- `/api/sky` baseline is **Open-Meteo** (keyless). `chooseCurrent()` prefers KMA observation for temperature/active-precip, and adopts KMA's *condition* only when KMA reports active precipitation; cloud/visibility/wind/is-day/sun always come from Open-Meteo.
- **Air quality:** `getFusedAirQuality()` priority AirKorea → Open-Meteo Air Quality → `null`. It only *subtly* shapes haze/visibility — never alarming/medical copy; everything is clamped.
- **Radar (approach signal):** the `snapshot.radar` approach direction in `/api/sky` is **RainViewer** (zoom 6, keyless) — reported only when the frames support it, never invented. This is separate from the displayed radar **imagery** (KMA 500 m, see *Radar imagery* above); RainViewer is no longer used for the displayed map.
- **Warnings:** KMA only, when keyed; never fabricated from forecast probabilities; degrades to `[]`.
- Each provider implements `WeatherProvider` (`lib/providers/base.ts`): fetch once per cache window, slice current/hourly/daily from it; methods may throw and the routes catch per-provider. Registry order (`lib/providers/registry.ts`) is the priority order: Open-Meteo, MET Norway, KMA, Pirate Weather, WeatherAPI.
- **Caching:** `lib/cache.ts` `cachedFetch` — in-memory TTL (5 min, `CACHE_TTL_MS` in `lib/seoul.ts`) with stale-while-revalidate: on upstream failure it serves the expired entry flagged `stale` rather than throwing. The radar pipeline reuses this for both the latlon grid and the rendered PNGs (in-flight de-dupe included).

### Time & visuals (pure, testable)
- `lib/cinematic/seoulTime.ts` `computeSunPhase()` — drives everything visual off Seoul wall time + today's sunrise/sunset, comparing **absolute instants** (never the browser TZ). Output is continuous: an `elevation` ∈ [-1, 1] plus `dayFactor`/`twilightFactor`/`goldenFactor`/`rising`. Colours interpolate on `elevation`, not the discrete phase name.
- `lib/atmosphere/weatherVisualConfig.ts` `buildVisualConfig(sun, snapshot)` — produces a flat bag of **clamped** visual params; raw API numbers never reach the shader. `readAtmosphere()` is the null-safe DOM readout. `lerpVisualConfig()` mutates a "live" config toward the "target" in place each frame (no allocation) for smooth crossfades.
- `lib/cinematic/skyImageField.ts` `selectSkyImage()` — pure selection of a still plate by `landmark × condition × anchor` (`day | golden | night`). The **anchor is the hard axis**, and there is a hard **dry-sky invariant**: a clear/partly-cloudy sky never selects a rain/snow plate. Plates are listed in `public/sky/manifest.json` and may be absent. Each slot's `srcs` is a string **or array** of variants; `normalizeSrcs()` + `pickVariantIndex(count, daySeed, slotKey)` choose one deterministically per Seoul calendar day (SSR-safe, no `Math.random()`/`Date.now()` in the render path).

## Conventions & gotchas

- **`.ts` import extensions are required in the test graph.** `tsconfig.json` enables `allowImportingTsExtensions`. Files reachable from a `*.test.ts` (i.e. `lib/**` modules under test) import each other with **explicit `.ts` extensions** (e.g. `from "../airQuality.ts"`) so Node's native loader can resolve them. App/component code uses extension-less `@/...` aliases (resolved by Next). If you add an import to a test-reachable `lib` file, include the `.ts` extension or `npm test` breaks.
- **The video era is mostly retired but not deleted.** The live scene background is the **still `ImageField`**. `components/atmosphere/scene/VideoGallery.tsx` is no longer mounted anywhere (only a stale comment in the shell mentions it), and `public/cinematic/**/*.mp4` belong to that era. But several video-era modules are *still imported* by surviving features — `poeticWeatherCopy.ts` (Arrival's poetic line), `plateManifest.ts`/`CINEMATIC_PLATES` and `selectPlate.ts` (the cinematic-engine diagnostics in Ground Station), and `locationGallery.ts` (its condition-mapping helpers are reused by `skyImageField.ts`). **Grep for imports before deleting any `lib/cinematic` module.**
- **`NEXT_PUBLIC_CINEMATIC_PLATES` is vestigial.** It is documented in `.env.example` but not read anywhere in current source.
- **ESLint scoped rule-offs are intentional.** `eslint.config.mjs` disables `react-hooks/immutability`, `refs`, and `set-state-in-effect` for `components/three/**` + `components/atmosphere/**` (imperative WebGL/ref render loops) and `set-state-in-effect` for `hooks/**`. Don't "fix" those warnings inside the scoped paths. (One scoped path, `components/cinematic/CinematicWeatherPage.tsx`, no longer exists — harmless dead config.) The radar's `<img>` tiles/echo carry documented `eslint-disable` for `next/image` — intentional, since many small raster tiles need exact %-placement that `next/image` fights.
- **Dev-only visual-review override:** `/sky?cond=<condition>&hour=<0–23>` forces any weather + time-of-day to audit sunset/fog/snow/night without waiting for live conditions. It's stripped to a no-op in production (`IS_DEV` guard in the shell), so prod behaviour is byte-identical.
- **Attribution is a hard requirement.** The radar **imagery** must credit **© 기상청(KMA)** (the echo) and **© CARTO © OpenStreetMap** (the basemap); the RainViewer **approach signal** is still credited separately (e.g. "레이더 접근: RainViewer"). MET Norway requires a contact-bearing `MET_NO_USER_AGENT`; without it the provider reports `needs-config` and is not called.
- **Env vars are server-only; the app runs with none of them** (each feature degrades on its own). `cp .env.example .env.local`. Only `NEXT_PUBLIC_*` reach the client. Keys are never echoed into status messages (`missingEnvVars` carries names only).
  - **`KMA_APIHUB_KEY`** — apihub.kma.go.kr radar authKey (HSR 500 m product). Powers the radar **echo**. Without it the radar section still renders the CARTO basemap + Korean labels but has no precip frames (empty state); the rest of the app is unaffected. Server-only — never `NEXT_PUBLIC_`.
  - **`RADAR_DATA_DIR`** (optional) — overrides where the latlon geo grid is cached (`data/radar/` by default). On a read-only / serverless FS the disk write fails gracefully to in-memory (refetched each cold start); set this to `/tmp/...` there so the cache persists across invocations.
  - **`KMA_RADAR_API_KEY`** — **retired** (old data.go.kr `getCmpImg` PNG path). Remove it from `.env.local`.
- **Asset/repo hygiene:** `public/cinematic/generated/*.mp4` is tracked via **Git LFS** (`.gitattributes`); `.webm/.mov/.png` cinematic assets and **new** files under `docs/` are gitignored (`/docs/` is in `.gitignore`). [Verified] **Caveat:** 4 spec docs committed before that rule remain **tracked** — `docs/{weather-sources,future-weather-sources,cinematic-plates,shot-prompts}.md` (`git ls-files docs/`); everything else in `docs/` is ignored. Still plates live in `public/sky/` as tracked `.webp`. The radar latlon cache lives in gitignored `/data/radar/`.
- **Seoul-only by design** — fixed coordinates and station IDs in `lib/seoul.ts`. This is an unofficial personal project; not for aviation/safety use.

## Reference docs

`docs/` (mostly gitignored — but the 4 spec `.md` below are tracked, see *Asset/repo hygiene*) holds the design/runbook history: `SEOULSKY_V2_SKYFARER_PLAN_AND_RUNBOOK.md` (the migration to the current `/sky` experience, untracked), `weather-sources.md` + `future-weather-sources.md` (fusion/caching/attribution spec), `cinematic-plates.md` + `shot-prompts.md` (the asset-generation pipeline), and the earlier "Descent" concept docs. `cinematic-plates.md`, `shot-prompts.md` and `public/cinematic/README.md` describe the **retired video-plate era** — historical reference, not current architecture (the live background is the still `ImageField`).

## Roadmap — remaining phases to portfolio-ready

> **Goal:** a live, public Vercel URL for `/sky`. This section is the single source of truth for project status and the path there. Every state claim is tagged `[Verified]` / `[Inferred]` / `[Unknown]` with a git/file citation — re-derive from the repo, don't trust prose.

### Verified current state (as of 2026-06-29)

- **Git:** on `main`, **0 unpushed commits** (`origin/main` == `HEAD`) `[Verified: git log origin/main..HEAD empty]`. Working tree: **1 modified tracked** (`public/sky/manifest.json`) + **5 untracked `__v2` plates** + an untracked `.serena/` tool dir `[Verified: git status --short]`. The manifest edit adds those 5 plates → uncommitted "image variants" work. No merge/rebase/detached state. Branches: local `main`; remotes `origin/main`, `origin/reliability-state` `[Verified: git branch -a]`.
- **Build/test:** Next `16.2.9` / React `19.2.4` `[Verified: package.json]`. **18 test files** `[Verified: find lib -name '*.test.ts' | wc -l]`. `recharts ^3.8.1` is a dep but **unused** (0 imports) `[Verified: grep -rn recharts app components lib]`. `npm run build` **not run this pass — verify before deploy** `[Unknown]`.
- **Routes:** only `app/sky` + `app/api/{sky,weather,radar}`; `/`, `/atmosphere`, `/diagnostics` are redirects with no page dirs `[Verified: app/page.tsx, next.config.ts, find app]`.
- **Scene plates:** all **18 base slots** filled (6 conditions × 3 anchors) + 18 `__v2` + 1 `__v3` = **37 `.webp`** `[Verified: ls public/sky, manifest.json]`. Data view = **4 sections** (Instruments → Radar → Forecast → GroundStation); no Sun & Sky `[Verified: SkyView.tsx]`.
- **Precip reliability is LIVE and merged** (supersedes any "on a branch / eventsScored=0" note): merged to `main` via `07fa279` (PR #1) `[Verified: git log]`; daily cron `precip-reliability.yml` on `main`; `origin/reliability-state` carries **5 daily persist commits, 2026-06-21→06-25** `[Verified: git log origin/reliability-state]`; **`eventsScored: 15`**, weights diverged from equal (met-norway ≈0.43 vs 0.20 equal), `observed_mm` populated → **ASOS ground-truth key is active** `[Verified: git show origin/reliability-state:data/reliability/source-weights.json + daily-skill.jsonl]`. **`MULTI_SOURCE_PRECIP` default OFF** `[Verified: app/api/sky/route.ts:31]` → runtime `/api/sky` is still byte-for-byte single-source; the learned weights don't yet tilt the live scene. ⚠️ **No persist commit since 2026-06-25 (4-day gap)** — verify the GitHub Action is still green `[Inferred: gap in git log origin/reliability-state; cause Unknown]`.
- **Deployment: none yet** — no `vercel.json`, no `.vercel/`, no live URL in any doc/README `[Verified: ls, grep]`. This is the gap to portfolio-ready.

### Phases

1. **Land pending work + green build** — commit the 5 `__v2` plates + `manifest.json` (decide `.serena/` → `.gitignore`); confirm `npm run build`, `npm test` (18 files), `npx tsc --noEmit` all pass; push `main`. **BLOCKING** (Vercel deploys from pushed git and the build must pass). *Build not yet run — verify.*
2. **Deploy to Vercel** — import the repo, first production build, confirm `/sky` renders and the `/`, `/atmosphere`, `/diagnostics` redirects work in prod. **BLOCKING** — this is the live URL. Depends on Phase 1.
3. **Production env + feature completeness** — set `KMA_APIHUB_KEY` (radar echo) + `RADAR_DATA_DIR=/tmp/...` (serverless FS), optionally the other provider keys; decide `MULTI_SOURCE_PRECIP`. **Non-blocking** (core scene is keyless; radar/precip degrade gracefully). Post-launch enrichment. Depends on Phase 2.
4. **Portfolio polish** — add the live URL to `README.md` (+ a screenshot/GIF), drop the unused `recharts` dep, sync the README architecture prose. **Non-blocking**, post-launch. Depends on Phase 2.
5. **Reliability + asset follow-ups (optional/deferred)** — investigate the 06-25 cron gap, decide `MULTI_SOURCE_PRECIP` rollout once `eventsScored ≥ 20` (`FULL_CONFIDENCE_EVENTS`), eyeball the KMA radar echo against live precip over Seoul (open caveat above), expand the landmark gallery beyond Han River. **Optional/deferred.**

**5 phases remaining to portfolio-ready (2 blocking: 1–2; 3 optional: 3–5).**

## Claude conventions

<!-- `_reference_instructions.md`에서 그대로 복사한 공통 규칙 (Models · Effort · Prompt 형식 · Git commit 형식). 프로젝트 간 byte-identical로 유지 — 여기서 직접 고치지 말고 `_reference_instructions.md`에서 관리한다. -->

## Claude Code Prompts
Claude Code 프롬프트를 요청하면 항상:
- 추천 model + effort
- command 코드블록 1개, 그리고 별도의 prompt body 코드블록 1개
- 프롬프트는 간결하게 (불필요하게 길게 쓰지 마)

Format: claude --model <model> --effort <effort>

(prompt body는 별도 코드블록)

Models
- haiku / claude-haiku-4-5 — 소소한 수정, 오타, 포맷팅, 저위험 단일 파일
- sonnet / claude-sonnet-5 — 기본값. 일반 버그 수정, 기능, 소규모 refactor, 테스트
- opus / claude-opus-4-8 — 복잡/cross-file, 어려운 디버깅, DB/auth/security/scheduling/notification 로직
- fable / claude-fable-5 — 가장 어려운 작업: 깊은 audit, 대규모 refactor, 긴 multi-step 조사

Effort
- low — 단순, 저위험
- medium — 일반 기본값
- high — 대부분의 실제 버그 수정·기능 작업
- xhigh — 깊은 추론, multi-file 조사, 신중한 audit
- max — 매우 어렵거나 high-stakes
- ultracode — 대규모 multi-step agentic 작업용 Claude Code 전용 모드

기본: 애매하면 sonnet medium. data integrity/auth/DB/schema/security/scheduling/notification은 최소 sonnet high.

## Git Commits
내가 직접 실행할 git add/commit을 줄 때는 항상:
- git add와 git commit을 하나의 "bash" 코드블록에 함께 넣어라 (한 번 클릭으로 전체 복사 가능하게).
- 별도 편집 없이 그대로 paste해서 실행 가능해야 한다. placeholder 금지, 실제 파일 경로와 실제 commit message를 넣어라.
- commit message는 professional English로.
- 형식:

  git add path/to/fileA path/to/fileB
  git commit -m "Professional English commit message here"

Claude Code는 필요하면 스스로 git add / git commit을 실행해도 된다.
모든 git 작업을 나에게 넘길 필요는 없다. 다만 위 포맷 규칙은
"내가 직접 실행하도록 명령을 제시할 때" 적용된다.
