# Generated cinematic source clips

This folder holds the AI-generated aerial video plates. **The video binaries are
git-ignored** (`.mp4`, `.webm`, `.mov`, `.png`); only this README is tracked.
Host the binaries via Git LFS, object storage (Vercel Blob / S3) or a CDN — see
the recommendation in `docs/cinematic-plates.md`.

The app works with this folder empty (procedural fallback).

## Currently generated

| File                   | Key         | Model               | Dur | Resolution | Size  | Audio |
| ---------------------- | ----------- | ------------------- | --- | ---------- | ----- | ----- |
| `clear-day-source.mp4` | `clear-day` | Google Veo 3.1 Lite | 8 s | 1344×768   | ~2.9 MB | none |

- Generated offline via the Higgsfield tools in the Claude CLI (model id
  `veo3_1_lite`), 16:9, no audio. 1080p was requested (priced 8 credits) but the
  lite tier delivered 1344×768 (~720p-class) for the same cost.
- Visual review (poster frame + in-browser composite): convincing aerial POV over
  Seoul with the Han River and distant ridges; subtle aircraft wing/window
  framing at the edges; **no text, logos, captions or watermark**; clean.
- 9 of 10 categories are **not** generated (free-credit budget: 10 credits total,
  one 8-credit clip). They fall back to the procedural 3D scene.

## Adding more

Drop additional `<key>-source.mp4` files here (keys in
`lib/cinematic/plateManifest.ts`) and flip that key's `generated` to `true` with
its `mp4Src` (and optional `webmSrc`/`posterSrc`). No code changes are otherwise
needed — selection and fallback are automatic.

Full instructions (model, prompt, camera direction, ffmpeg optimization):
[`../../../docs/cinematic-plates.md`](../../../docs/cinematic-plates.md).
