# SeoulSky "Skyfarer" — Seoul landmark shot prompts

The shot bible for the **location × condition × day/night** video gallery behind
`/sky`. Clips are generated **offline** with the Higgsfield video tools and saved
under `public/cinematic/locations/`; the runtime only reads
[`public/cinematic/manifest.json`](../public/cinematic/manifest.json) and plays
files. **No Higgsfield (or any third-party) call happens at runtime.**

This document is the source of record for prompts so Phase 1 stays **re-runnable**:
to expand the library, pick an un-generated cell below, generate it, drop the file
in `locations/`, and add a manifest entry.

---

## Conventions

- **Aspect:** 16:9. **Motion:** one smooth, continuous, slow camera move — built to
  loop (compatible first/last framing). **No audio** (muted at runtime regardless).
- **Drama over realism**, but the landmark must stay **recognizable**. Camera POV is
  unconstrained: ground level, low glides, high/aerial sweeps, crane orbits, dollies.
- **The spaceship canopy is a separate fixed overlay (Phase 3) — never put a
  spaceship, cockpit, window frame, dashboard or HUD in the shot.**
- **No people in focus, no text, no captions, no signage lettering, no logos, no
  watermark, no UI.** (These also go in the negative suffix below.)
- **Filenames:** `public/cinematic/locations/<location>__<condition>__<day|night>.<ext>`
  — double-underscore separated, all lowercase, `.mp4` (source served directly;
  no `ffmpeg` on the build machine to transcode `.webm`).

### Location slugs

| Slug | Korean | English | Signature conditions |
| --- | --- | --- | --- |
| `hangang-park` | 한강공원 | Han River Park | clear (day) |
| `gyeongbokgung` | 경복궁 | Gyeongbokgung Palace | rain, snow |
| `cheonggyecheon` | 청계천 | Cheonggyecheon Stream | rain / night |
| `inwangsan` | 인왕산 | Inwangsan Mountain | ~~fog / clear~~ **(dropped)** |
| `gyeongui-forest` | 경의선숲길공원 | Gyeongui Line Forest Park | partly-cloudy |
| `gwanaksan` | 관악산 | Gwanaksan | ~~overcast / cloud sea~~ **(dropped)** |
| `naksan-fortress` | 낙산 성곽길 | Naksan Fortress Wall | ~~clear / sunset~~ **(dropped)** |
| `namsan-tower` | 남산타워 | N Seoul Tower | night / clear |
| `hangang` | 한강 | Han River | any |

### Condition slugs

`clear` · `partly-cloudy` · `overcast` · `rain` · `snow` · `fog` — each in `day`
and `night`. (광안대교 is intentionally absent — it's in Busan, not Seoul.)

### Models (this machine, starter plan)

- **Veo 3.1 is plan-gated** ("requires plus plan or higher") — unavailable here.
- **Kling 2.6** (`kling2_6`, 5 cr / 5 s, `sound:false`) — workhorse for breadth.
- **Kling 3.0 pro** (`kling3_0`, `mode:pro`, `sound:"off"`) — recognition-critical
  hero shots (palace architecture, the N Seoul Tower silhouette).
- If a prompt is intercepted by a preset suggestion, retry literally with
  `declined_preset_id` set to the suggested preset id.

### Prompt recipe

Compose each prompt as: **camera move + landmark core subject + condition/light
modifier + shared style/negative suffix.**

- **Camera POV vocabulary** (rotate for variety): `slow aerial push-in`,
  `high banking aerial drift`, `low gliding camera`, `slow orbiting crane`,
  `steady forward dolly`, `sweeping shot gliding alongside`.
- **Shared style/negative suffix** (append to every prompt):
  > Photorealistic, cinematic, 16:9, smooth continuous motion, seamless loop.
  > No people in focus, no text, no captions, no signage lettering, no logos,
  > no watermark, no spaceship, no cockpit, no UI.

### Condition modifiers (reusable)

| Condition | Day modifier | Night modifier |
| --- | --- | --- |
| `clear` | bright clear sky, crisp sunlight, deep blue, a few drifting clouds | clear deep-blue night sky, glittering city lights |
| `partly-cloudy` | scattered clouds, dappled moving sunlight | broken clouds lit by the city glow, patches of stars |
| `overcast` | flat grey diffuse light, heavy low cloud deck | dark heavy cloud lid, sodium-orange underglow |
| `rain` | steady rainfall, wet glistening surfaces, puddle reflections, soft grey light | light rain, neon and lights reflecting on wet pavement |
| `snow` | gentle falling snow, surfaces dusted white, soft cold light | snow drifting through lamplight, blue-cold night, white rooftops |
| `fog` | thick drifting fog, soft pale light, low visibility, muffled forms | fog haloing streetlights, dim glow bleeding through mist |

---

## Batch 1 (generated)

The starter batch. **7 kept** (6 landmarks; clear / partly-cloudy / rain / snow);
**3 dropped** for weak results — `gwanaksan__overcast__day`, `inwangsan__fog__day`,
`naksan-fortress__clear__day` — removed from the manifest and `locations/`. Their
conditions **overcast & fog are now uncovered** → Phase 3 broadens / falls back.
`hangang-park__clear__day` was **regenerated on Kling 3.0 pro** for slow, near-still
clouds (the first Kling 2.6 take had time-lapse-fast clouds). Camera move in **bold**:

1. **`hangang-park__clear__day`** · **kling3_0 pro (regenerated)** — *Low-to-mid
   altitude forward push* over Han River Park (한강공원) and the Han River on a clear
   sunny Seoul day. Natural **slow-drifting cumulus — NOT time-lapse speed; slow,
   majestic, almost still.** Warm golden afternoon light reflecting off the water,
   lush green riverbanks, a long bridge and the distant Seoul skyline. + suffix.
2. **`hangang__clear__night`** · kling2_6 — *High aerial* of the Han River winding
   through Seoul at night, illuminated bridges arcing across the water reflecting
   golden and white light, glowing riverside skyline, clear night sky. Slow smooth
   banking aerial drift following the river. + suffix.
3. **`cheonggyecheon__rain__night`** · kling2_6 — *Low tracking shot* gliding along
   Cheonggyecheon Stream downtown at night in light rain. Restored urban stream with
   stepping stones and stone embankments, neon and shop lights reflecting on wet
   water and pavement, modern buildings above. Glide low just above the stream.
   + suffix.
4. **`inwangsan__fog__day`** · kling2_6 — **DROPPED** (weak result; removed from
   manifest + `locations/`). *Slow reveal* of Inwangsan Mountain shrouded in thick
   drifting fog at dawn. Rugged granite rock faces and ridgelines, scattered pine,
   fragments of the old grey Seoul fortress wall, mist rolling between peaks, soft
   pale light. Steady forward drift through the fog. + suffix.
5. **`gyeongui-forest__partly-cloudy__day`** · kling2_6 — *Steady forward dolly*
   along Gyeongui Line Forest Park, a long narrow linear park on a former railway
   line, partly cloudy. Tree-lined green path with benches, low-rise cafes and brick
   buildings flanking it, dappled sunlight through scattered clouds. + suffix.
6. **`gwanaksan__overcast__day`** · kling2_6 — **DROPPED** (weak result; removed from
   manifest + `locations/`). *Slow aerial drift* above a cloud sea from Gwanaksan
   Mountain south of Seoul on a heavily overcast day: a vast sea of low grey clouds,
   distant ridgelines emerging like islands, rocky summit outcrops and windswept pine
   in the foreground, brooding diffuse daylight. + suffix.
7. **`naksan-fortress__clear__day`** · kling2_6 — **DROPPED** (weak result; removed
   from manifest + `locations/`). *Sweeping shot gliding alongside* the Naksan
   Fortress Wall climbing the grassy ridge of Naksan at golden hour under a clear
   sky. Weathered grey stone battlements winding up the hill, warm low sunlight
   raking the stone, Seoul cityscape glowing below. + suffix.
8. **`gyeongbokgung__snow__day`** · kling2_6 — *Slow forward glide* through
   Gyeongbokgung Palace during gentle falling snow. Traditional palace rooftops
   dusted white, painted dancheong eaves edged with snow, flakes settling on the
   wide stone courtyard, soft overcast winter light. + suffix.
9. **`gyeongbokgung__rain__day`** · **kling3_0 pro (hero)** — *Slow aerial push-in*
   over Gyeongbokgung Palace on a rainy overcast day. Sweeping tiled hipped roofs
   and painted dancheong eaves, the Geunjeongjeon throne hall and wide stone
   courtyard, Gwanghwamun gate, faint misty Inwangsan behind. Steady rainfall, wet
   glistening rooftops and flagstones, puddle reflections, soft grey light. + suffix.
10. **`namsan-tower__clear__night`** · **kling3_0 pro (hero)** — *Slow orbiting
    crane* revealing N Seoul Tower glowing atop forested Namsan hill, the Seoul
    skyline of glittering city lights spread far below, clear deep-blue night sky,
    distant mountains silhouetted. + suffix.

---

## Full matrix (expansion backlog)

Mark cells `[done]` as they are generated and added to the manifest. ★ = signature
condition for that landmark (generate these first). The core subject line is reused
across that landmark's variants — vary only the condition modifier, time of day,
and camera POV.

> **Core subjects** (reuse verbatim):
> - **hangang-park** — Han River Park: riverside lawns, walking/cycle paths, the wide
>   Han River and a long bridge, modern apartment towers beyond.
> - **gyeongbokgung** — Gyeongbokgung Palace: traditional Korean royal palace, tiled
>   hipped roofs, painted dancheong eaves, Geunjeongjeon throne hall, wide stone
>   courtyard, Gwanghwamun gate, Inwangsan behind.
> - **cheonggyecheon** — Cheonggyecheon Stream: restored downtown stream, stepping
>   stones, stone embankments, low footbridges, buildings rising on both banks.
> - **inwangsan** — Inwangsan Mountain: granite rock faces and ridgelines, pine,
>   fragments of the old Seoul fortress wall, the city below.
> - **gyeongui-forest** — Gyeongui Line Forest Park: long narrow linear park on a
>   former railway, tree-lined path, benches, low-rise cafes and brick buildings.
> - **gwanaksan** — Gwanaksan: rocky summit outcrops and pine, ridgelines and a sea
>   of cloud, temple pavilions, the southern Seoul sprawl in the distance.
> - **naksan-fortress** — Naksan Fortress Wall: weathered grey stone city wall
>   climbing the grassy Naksan ridge, the Seoul cityscape below.
> - **namsan-tower** — N Seoul Tower: the illuminated tower spire atop forested
>   Namsan hill, the Seoul skyline and city lights spread below.
> - **hangang** — Han River: the wide river winding through the city, arched
>   illuminated bridges, riverside skyline.

| Location | clear | partly-cloudy | overcast | rain | snow | fog |
| --- | --- | --- | --- | --- | --- | --- |
| hangang-park | ★ day `[done]` · night | day · night | day · night | day · night | day · night | day · night |
| gyeongbokgung | day · night | day · night | day · night | ★ day `[done]` · night | ★ day `[done]` · night | day · night |
| cheonggyecheon | day · night | day · night | day · night | day · ★ night `[done]` | day · night | day · night |
| ~~inwangsan~~ _(dropped)_ | day · night | day · night | day · night | day · night | day · night | day `[dropped]` · night |
| gyeongui-forest | day · night | ★ day `[done]` · night | day · night | day · night | day · night | day · night |
| ~~gwanaksan~~ _(dropped)_ | day · night | day · night | day `[dropped]` · night | day · night | day · night | day · night |
| ~~naksan-fortress~~ _(dropped)_ | day `[dropped]` · night | day · night | day · night | day · night | day · night | day · night |
| namsan-tower | day · ★ night `[done]` | day · night | day · night | day · night | day · night | day · night |
| hangang | day · ★ night `[done]` | day · night | day · night | day · night | day · night | day · night |

**Expansion priority order** (most common Seoul conditions first): remaining
`clear` and `partly-cloudy` days → `overcast`/`rain` days → night variants of the
above → `snow`/`fog` long tail. Keep curating aggressively; discard any clip with
text/logos, a frozen frame, an unrecognizable landmark, or a hard loop seam.
