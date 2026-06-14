"use client";

/**
 * The cinematic film grade — done as lightweight, always-stable DOM overlays
 * painted over the WebGL canvas instead of a full-screen postprocessing pass.
 *
 *   • vignette  — a soft radial darkening + a faint top/bottom fall-off that
 *                 settles the eye on the horizon (replaces the GL Vignette)
 *   • grain     — an extremely subtle inline-SVG turbulence texture at ~4–5%
 *                 (replaces the GL Noise); drifts slowly unless reduced-motion
 *
 * Bloom / depth-of-field / chromatic-aberration are intentionally not emulated
 * here: bloom is carried in-scene by the additive sun/moon glow sprites, and
 * depth by atmospheric fog. Everything is pointer-events:none and sits beneath
 * the HUD text.
 */

// Inline SVG fractal noise, encoded once as a data URI (no network, no asset).
const GRAIN_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">` +
    `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>` +
    `<feColorMatrix type="saturate" values="0"/></filter>` +
    `<rect width="100%" height="100%" filter="url(#n)"/></svg>`,
);

export default function CinematicGrade({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-20" aria-hidden>
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
