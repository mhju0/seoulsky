# Cinematic video plates

SeoulSky's main page is a **hybrid** of two layers:

1. **Base plate** — a photoreal, AI-generated aerial video selected from the
   current Seoul time + weather (this folder, under `generated/`).
2. **Live three.js** — composited transparently on top, adding the current
   precipitation, near-camera vapor, fog, atmospheric tint and exposure.

The video is the *distant cinematic world*; three.js is the *live adaptation*.

**The real-time 3D scene works completely without any file here.** If a plate is
missing, the wrong codec, or fails to play, the app falls back to the fully
procedural scene — never a blank page. You can delete everything in `generated/`
and the site still runs.

There is **no runtime Higgsfield (or any third-party) API call, account, SDK,
credential or affiliation** in the app. The footage is generated *offline* (via
the Higgsfield tools in the Claude CLI) and dropped into `generated/`. Higgsfield
is used only as an asset-generation tool; no branding/UI/proprietary assets are
included.

## How it works

- Master switch: `NEXT_PUBLIC_CINEMATIC_PLATES` (default **on**; set `0` to force
  pure-procedural). See `.env.example`.
- The manifest `lib/cinematic/plateManifest.ts` declares the 10 plate keys and
  which ones actually have a file (`generated: true`).
- `lib/cinematic/selectPlate.ts` deterministically maps live conditions to one
  key (see the priority ladder in `docs/cinematic-plates.md`).
- When the selected key has a file, the page enters **hybrid** mode; otherwise it
  stays **procedural** for that condition.

## Plate keys

| Key              | Chosen when                                            |
| ---------------- | ------------------------------------------------------ |
| `clear-day`      | clear / partly-cloudy, daytime                         |
| `clear-night`    | clear / partly-cloudy, night                           |
| `dawn`           | pre-dawn / sunrise phase                               |
| `sunset`         | golden-hour / sunset / blue-hour phase                 |
| `cloudy`         | heavy cloud cover, daytime                             |
| `overcast-night` | heavy cloud cover, night                               |
| `fog`            | fog / very low visibility                              |
| `rain`           | drizzle / rain / heavy-rain / sleet, or 호우·태풍 warning |
| `storm`          | thunderstorm                                           |
| `snow`           | snow / live snowfall, or 대설 warning                   |

## File locations

Source-of-record clips live in `generated/` and are **git-ignored** (binaries).
All 10 keys now have a source file (generated offline with Google Veo 3.1 Lite,
8 s · 16:9 · no audio · 1344×768):

```
public/cinematic/generated/<key>-source.mp4         ← Higgsfield source (×10)
public/cinematic/generated/<key>.webm               ← (optional) optimized VP9/AV1
public/cinematic/generated/<key>.mp4                ← (optional) optimized H.264
```

`<key>` ∈ {clear-day, clear-night, dawn, sunset, cloudy, fog, rain, storm, snow,
overcast-night}. The manifest points `mp4Src` / `webmSrc` at whichever files
exist; with no `ffmpeg` on this machine it serves each `-source.mp4` directly.

## Encoding spec (recommended target)

- **Aspect:** 16:9. **Resolution:** ≥1080p when the model allows (our `clear-day`
  came back 1344×768 from Google Veo 3.1 Lite; `object-fit: cover` crops cleanly).
- **Duration:** 8–12 s, authored loop-friendly (steady forward flight, compatible
  first/last framing). **fps:** 24 (cinematic).
- **No audio, no captions, no text, no logos, no watermark.**
- **Container/codec:** mp4/H.264 is the universal fallback; add a `.webm`
  (VP9/AV1) sibling for smaller modern delivery (needs `ffmpeg`).
- Keep each file small (target < ~6 MB) so local dev and first paint stay snappy.

## Looping & crossfade

- Steady-state looping uses the native `loop` attribute (clips are authored to
  loop). If a seam shows, regenerate with first/last-frame compatibility, or
  implement a two-video crossfade-loop in `CinematicPlate.tsx`.
- Weather/time changes crossfade over ~2.8 s with no black flash (the incoming
  plate fades in fully on top of the still-opaque outgoing one; ≤2 videos decode
  at once).

## Generating / regenerating

See [`../../docs/cinematic-plates.md`](../../docs/cinematic-plates.md) for the
exact model, prompt, camera direction, how to generate one clip, how to add a new
weather category, and how to optimize source video with `ffmpeg`.
