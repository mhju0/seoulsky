# Cinematic plates — hybrid AI-footage + live 3D

The SeoulSky home page (`/`) composites an AI-generated aerial **video plate**
with the existing real-time three.js sky. This document covers the architecture,
how the footage is generated, how a plate is chosen at runtime, the fallback
chain, and how to regenerate / extend the library.

## Visual stack

```
Layer 1  Higgsfield-generated cinematic video plate     (z-0,  <video>)
Layer 2  real-time transparent three.js atmosphere       (z-10, <Canvas>, hybrid = transparent)
Layer 3  live weather particles + near-camera effects     (same Canvas: rain/snow/vapor)
Layer 4  cinematic CSS grade (+ live atmosphere tint)     (z-20, CinematicGrade)
Layer 5  minimal Korean weather overlay                   (z-30, MinimalWeatherOverlay)
```

The video is the *distant cinematic world*; three.js provides the *live
adaptation* (current precipitation intensity, near-cloud vapor, fog veil,
atmospheric tint, exposure, wind-driven motion). In **hybrid** mode the canvas is
created transparent (`alpha: true`, transparent clear) and the opaque sky dome,
stars, distant cloud banks, procedural city and the sun/moon glows are hidden
(the footage already carries them) — so two opaque skies never stack. In
**procedural** mode the same canvas renders the full self-contained world (the
dome covers every pixel, so it looks identical to an opaque canvas).

### Why Higgsfield is never called at runtime

- No credentials, generation URLs or CLI tokens live in the app, env files,
  server routes, README, diagnostics or git.
- Footage is generated **offline** in the Claude CLI session and saved to
  `public/cinematic/generated/`. The website only ever loads a static file.
- This keeps the public site cheap, fast and safe: visitors never trigger a paid
  generation, and a missing asset just routes to the procedural scene.

## Render-mode resolution (`CinematicWeatherPage.tsx`)

```
hybrid       WebGL ok + master switch on + selected key has a file + full motion
procedural   WebGL ok + (no file for the key | plates disabled | reduced motion | ?plate=procedural)
fallback-2d  WebGL unavailable / Canvas threw  → existing 2D WebGLFallback
```

Fallback order (no single failure blanks the page):

1. selected optimized video plate
2. source mp4 (if the optimized sibling is absent)
3. previous valid plate (held opaque through a failed crossfade)
4. procedural three.js scene
5. polished 2D WebGL fallback

A `<video>` `error` event (missing file, codec, corruption) or a key with no
declared source flips the page to procedural; a Canvas runtime throw flips it to
the 2D fallback.

## Runtime plate selection (`lib/cinematic/selectPlate.ts`)

Deterministic, pure, unit-tested (`selectPlate.test.ts`). First match wins —
**observed conditions, never mere probability**:

1. thunderstorm                         → `storm`
2. snow / live snowfall / 대설 warning   → `snow`
3. rainy condition / 호우·태풍 warning    → `rain`
4. fog or visibility < 1200 m            → `fog`
5. cloud cover ≥ 70% (or overcast/cloudy)→ `cloudy` (day) | `overcast-night` (night)
6. pre-dawn / sunrise                     → `dawn`
7. golden-hour / sunset / blue-hour       → `sunset`
8. clear/partly-cloudy at night           → `clear-night`
9. default daylight                       → `clear-day`

Inputs come from the lean `/api/sky` fused snapshot: current condition, cloud
cover, precipitation, snowfall, visibility, `is_day`, today's sunrise/sunset
(KST), and active KMA warnings. Time-of-day uses the continuous sun-phase model
(`lib/cinematic/seoulTime.ts`), always in Asia/Seoul. Selection is re-evaluated
on each weather refresh and on a 60 s tick so dawn/sunset/night boundaries are
caught between data refreshes.

## Crossfade, loop, reduced motion

- **Crossfade** (`CinematicPlate.tsx`): on a key change the incoming plate fades
  in over ~2.8 s fully on top of the still-opaque outgoing plate, which is only
  unmounted afterwards — no black flash; at most two videos decode at once.
- **Loop**: native `loop` attribute. Clips are authored loop-friendly (steady
  forward flight, compatible first/last framing). For a hard seam, regenerate
  with first/last-frame control or add a two-video crossfade-loop.
- **Reduced motion**: `prefers-reduced-motion` disables the video plate and uses
  the calmed procedural scene (camera drift + particle velocity already reduced).

## Diagnostics

`/diagnostics` → "시네마틱 엔진" shows only plain serializable values: live
deterministic selection (key, reason, sun phase, file availability, format), the
runtime status the home page wrote to `localStorage` (render mode, playing plate,
load state, last transition, playback errors, procedural-fallback flag), and the
N/10 library status. No credentials, URLs, three.js objects or DOM nodes.

## Dev-only overrides

Only when `NODE_ENV !== "production"`; never alter real weather data:

```
/?plate=clear-day     force a specific plate (visual review)
/?plate=rain          force an ungenerated key → demonstrates the fallback
/?plate=procedural    force the procedural scene
```

## Generating a clip (Higgsfield in the Claude CLI)

Model: **Google Veo 3.1 Lite** (`veo3_1_lite`) — clean, budget-friendly, 16:9,
text-to-video. Settings used: `resolution: "1080p"`, `duration: 8`,
`aspect_ratio: "16:9"`, `generate_audio: false` (8 credits; delivered 1344×768).

1. Preflight cost (no spend): `generate_video` with `get_cost: true`.
2. Submit `generate_video` with the per-plate prompt → returns a job id.
3. Poll `job_status` until `completed` (video ~60–180 s); read the result URL.
4. Download the mp4 into `public/cinematic/generated/<key>-source.mp4`
   (the result URL contains a private user path — **never** commit it).
5. Verify: file plays, 16:9-ish, no logos/text/defects, airplane-POV. A poster
   frame can be pulled with macOS `qlmanage -t -s 1280 -o /tmp <file>`.

### Base prompt (one per-state lead sentence is PREpended to it)

> Ultra-photorealistic continuous aerial POV shot from a stabilized cinema camera
> mounted near the nose of a quiet high-altitude glider flying above Seoul, South
> Korea. Smooth forward movement through enormous natural cloud formations, subtle
> aircraft banking, stable horizon, realistic atmospheric inertia, faint Han River
> and distant urban silhouettes far below through haze, premium nature-documentary
> cinematography, realistic cloud scale, cinematic 24-35 mm optics, natural
> exposure, restrained lens glow, subtle film grain, deep atmospheric perspective,
> one uninterrupted shot, no cuts, no cockpit dashboard, no people, no text, no
> logos, no interface, no watermark, no cartoon clouds, no fantasy colors, no
> game-like motion, loop-compatible beginning and ending direction.

Each clip prepends one state-specific lead sentence (so the mood leads, the
constraints follow):

| Key              | Per-state lead                                                              |
| ---------------- | -------------------------------------------------------------------------- |
| `clear-day`      | bright daylight, deep blue sky, scattered high clouds, sunlit cloud edges  |
| `clear-night`    | moonlit cloud tops, distant city lights far below, sparse faint stars      |
| `dawn`           | cool pre-sunrise sky, warm glowing horizon band, last city lights fading   |
| `sunset`         | warm low-angle sunlight, glowing orange/pink cloud edges, long shadows     |
| `cloudy`         | large layered gray-blue cloud formations, flat diffuse daylight            |
| `fog`            | low visibility, thick soft vapor/mist, city hidden below a sea of fog      |
| `rain`           | wet dark moody atmosphere, heavy rain clouds, streaking rain, low vis      |
| `storm`          | deep towering dark thunderclouds, rare faint internal lightning, ominous   |
| `snow`           | cold pale overcast, snow falling at multiple depths, snow-laden clouds     |
| `overcast-night` | low dark cloud ceiling lit from beneath by the city's reflected glow       |

## Add a new weather category

1. The 10 keys already exist in `lib/cinematic/plateManifest.ts`. To add a brand
   new key, extend `CinematicPlateKey` and `CINEMATIC_PLATES`, then add a branch
   to `selectCinematicPlate` (+ a test case).
2. Generate the clip → `generated/<key>-source.mp4`.
3. In the manifest set `generated: true` and `mp4Src` (+ `webmSrc`/`posterSrc`).
   Done — selection, hybrid compositing and fallback are automatic.

## Optimize source video (`ffmpeg`, optional)

`ffmpeg` was **not** available during this build, so the manifest serves the
source mp4 directly. When available, produce smaller browser siblings:

```bash
# H.264 mp4, faststart, no audio, restrained bitrate
ffmpeg -i clear-day-source.mp4 -an -movflags +faststart -c:v libx264 \
  -crf 23 -preset slow -pix_fmt yuv420p clear-day.mp4
# VP9 webm (preferred modern source)
ffmpeg -i clear-day-source.mp4 -an -c:v libvpx-vp9 -b:v 0 -crf 32 clear-day.webm
# poster frame
ffmpeg -i clear-day-source.mp4 -frames:v 1 -q:v 3 clear-day-poster.jpg
```

Then point the manifest at `clear-day.webm` / `clear-day.mp4` /
`clear-day-poster.jpg` and keep `-source.mp4` as the source-of-record. Don't
upscale low-res footage just to claim 4K.

## Hosting the binaries (git)

The clips are git-ignored. Pick one before pushing:

- **Git LFS** — `git lfs track "public/cinematic/generated/*.mp4 *.webm"` (simple,
  versioned; watch LFS quota).
- **Vercel Blob / S3 / CDN** — host externally and point the manifest at absolute
  URLs (best for production bandwidth).
- **Local-only** — keep them out of git entirely (current default); fresh clones
  run procedurally until the binaries are fetched.

## What was generated in this pass

**Starter plan, 272 credits.** Cost preflight: `veo3_1_lite` 1080p/8 s/no-audio =
**8 credits** (cheapest viable cinematic 16:9; Seedance 720p was ~17.5, Grok ~12).
Generated the **full 10/10 library** — `clear-day` (carried over from a prior
pass) plus the 9 remaining keys this pass (`clear-night`, `dawn`, `sunset`,
`cloudy`, `fog`, `rain`, `storm`, `snow`, `overcast-night`) — **72 credits**
(9 × 8), leaving **200**. Each clip was reviewed from a poster frame: convincing
aircraft/glider POV, stable horizon, deep haze, no text/logos/captions/watermark.

The starter plan caps generation at **2 concurrent jobs**, so the 9 clips ran in
waves of two (submit 2 → poll → download → submit next 2). Veo 3.1 Lite returned
**1344×768** for every clip despite a `1080p` request (the lite tier downscales);
`object-fit: cover` crops it cleanly to any viewport. The optional extra keys
(`sunrise`, `golden-hour`, `blue-hour`) were intentionally skipped — the selector
already routes those phases to `dawn` / `sunset`, so separate clips would never be
chosen without also changing the selector.
