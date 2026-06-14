# Optional cinematic video plates

This folder is **optional**. SeoulSky's real-time 3D scene (clouds, lighting,
fog, particles, time-of-day, weather response) works completely without any
files here. These plates are an opt-in way to composite externally-generated
cinematic footage *over* the live scene.

There is **no Higgsfield (or any third-party) API, account, SDK, or
affiliation** involved. You generate/own the footage yourself and drop it here.

## How to enable

1. Produce footage and place files at the exact paths below.
2. Set `NEXT_PUBLIC_CINEMATIC_PLATES=1` in `.env.local`.
3. Restart `npm run dev`.

The app picks a plate from the current Seoul time-of-day + weather and
**crossfades** between plates as conditions change (see
`components/cinematic/CinematicPlate.tsx`). A missing file simply renders
nothing — never a broken element.

## Expected files

| File                            | When it's chosen                                  |
| ------------------------------- | ------------------------------------------------- |
| `public/cinematic/clear-day.webm`  | clear / partly-cloudy, daytime                  |
| `public/cinematic/clear-night.webm`| clear / partly-cloudy, night                    |
| `public/cinematic/sunrise.webm`    | pre-dawn / sunrise phase                        |
| `public/cinematic/sunset.webm`     | golden-hour / sunset / blue-hour phase          |
| `public/cinematic/cloudy.webm`     | cloudy / overcast / fog / snow                  |
| `public/cinematic/rain.webm`       | drizzle / rain / heavy-rain / sleet             |
| `public/cinematic/storm.webm`      | thunderstorm                                    |

## Encoding spec (recommended)

- **Container / codec:** WebM (VP9) — add an `.mp4` (H.264) sibling if you need
  Safari fallback and extend `CinematicPlate` accordingly.
- **Resolution:** 1920×1080 (16:9). 2560×1440 for high-DPR displays.
- **Frame rate:** 24 fps (cinematic) or 30 fps.
- **Loop duration:** 12–20 s, seamlessly loopable (first/last frame match).
- **Bitrate:** ~6–10 Mbps VP9 (keep each file well under ~15 MB).
- **Color:** Rec.709, graded to sit *over* the 3D scene with `screen` blend.
  Keep blacks genuinely black so the blend reads as added light/atmosphere.
- **Audio:** none (strip it — the plates play muted).

Plates composite with `mix-blend-mode: screen` at a configurable opacity
(`blend` prop, default 0.45), so they augment the real-time scene rather than
replacing it.
