"use client";

import { computeSunPhase } from "@/lib/cinematic/seoulTime";
import { buildSceneConfig, normalizeWeather } from "@/lib/cinematic/weatherSceneConfig";
import type { CinematicRenderMode } from "@/lib/cinematic/cinematicStatus";
import type { SkySnapshot } from "@/lib/types";

/**
 * The cinematic film grade — lightweight, always-stable DOM overlays painted
 * over the WebGL canvas instead of a full-screen postprocessing pass.
 *
 *   • vignette  — soft radial darkening + faint top/bottom fall-off
 *   • grain     — a whisper-quiet inline-SVG turbulence texture, drifting slowly
 *   • atmosphere (HYBRID ONLY) — a subtle, live colour cast + horizon haze veil
 *                 derived from the current Seoul sky, so the FIXED video plate
 *                 reads at the current time-of-day temperature and visibility
 *                 (warmer at golden hour, cooler/darker at night, hazier when
 *                 visibility is low or the air is thick). In procedural mode the
 *                 three.js scene already self-grades, so this is skipped.
 *
 * Bloom / depth-of-field are not emulated here: bloom is carried in-scene by the
 * additive glow sprites, depth by atmospheric fog. Everything is
 * pointer-events:none and sits beneath the HUD text.
 */

// Inline SVG fractal noise, encoded once as a data URI (no network, no asset).
const GRAIN_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">` +
    `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>` +
    `<feColorMatrix type="saturate" values="0"/></filter>` +
    `<rect width="100%" height="100%" filter="url(#n)"/></svg>`,
);

const ch = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);

/** Live colour cast + haze veil for the video plate, from the current sky. */
function atmosphere(snapshot: SkySnapshot | null, mode: CinematicRenderMode) {
  if (mode !== "hybrid" || !snapshot) return null;
  const cur = snapshot.current;
  const sun = computeSunPhase({
    sunrise: snapshot.sun.sunrise,
    sunset: snapshot.sun.sunset,
    isDayHint: cur.isDay,
  });
  const cfg = buildSceneConfig(sun, normalizeWeather(cur, snapshot.air ?? null));
  const tint = `${ch(cfg.fogColor[0])}, ${ch(cfg.fogColor[1])}, ${ch(cfg.fogColor[2])}`;
  // Temperature cast: soft-light toward the current atmosphere colour. Stronger
  // at night (which also gently darkens the bright daytime footage).
  const castOpacity = Math.min(0.32, 0.1 + (1 - sun.dayFactor) * 0.12 + cfg.haze * 0.06);
  // Horizon haze: a low band rising from the bottom for low visibility / thick air.
  const veilOpacity = Math.min(0.42, cfg.haze * 0.3 + (1 - sun.dayFactor) * 0.06);
  return { tint, castOpacity, veilOpacity };
}

interface Props {
  reducedMotion: boolean;
  snapshot?: SkySnapshot | null;
  mode?: CinematicRenderMode;
}

export default function CinematicGrade({ reducedMotion, snapshot = null, mode = "procedural" }: Props) {
  const atmos = atmosphere(snapshot, mode);
  return (
    <div className="pointer-events-none fixed inset-0 z-20" aria-hidden>
      {/* Live atmosphere cast + horizon haze (hybrid only) — sits UNDER the
          vignette/grain so those still frame the whole image. */}
      {atmos && (
        <>
          <div
            className="absolute inset-0"
            style={{ backgroundColor: `rgb(${atmos.tint})`, opacity: atmos.castOpacity, mixBlendMode: "soft-light" }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to top, rgba(${atmos.tint}, ${atmos.veilOpacity}) 0%, rgba(${atmos.tint}, 0) 48%)`,
            }}
          />
        </>
      )}

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 120% at 50% 46%, rgba(0,0,0,0) 52%, rgba(2,4,10,0.28) 78%, rgba(1,2,6,0.62) 100%)",
        }}
      />
      {/* Gentle vertical settle — keeps it from feeling like hard letterbox bars */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(2,4,10,0.22) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 80%, rgba(1,2,6,0.30) 100%)",
        }}
      />
      {/* Film grain — whisper-quiet, additive-ish via soft-light blend */}
      <div
        className={reducedMotion ? "absolute inset-0" : "absolute inset-0 cine-grain"}
        style={{
          backgroundImage: `url("data:image/svg+xml,${GRAIN_SVG}")`,
          backgroundRepeat: "repeat",
          opacity: 0.05,
          mixBlendMode: "soft-light",
        }}
      />
    </div>
  );
}
