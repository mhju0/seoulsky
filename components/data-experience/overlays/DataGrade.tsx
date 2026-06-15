"use client";

import { computeSunPhase } from "@/lib/cinematic/seoulTime";
import { buildAtmosphericConfig } from "@/lib/data-experience/atmosphericConfig";
import type { SkySnapshot } from "@/lib/types";

/**
 * The data experience's film grade — lightweight DOM overlays over the WebGL
 * canvas (no postprocessing pass, mirroring the homepage approach): a soft
 * accent wash tying the frame to the live weather colour, a vignette, and a
 * whisper-quiet drifting grain. All pointer-events:none, beneath the HUD text.
 */
const GRAIN_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">` +
    `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>` +
    `<feColorMatrix type="saturate" values="0"/></filter>` +
    `<rect width="100%" height="100%" filter="url(#n)"/></svg>`,
);

const ch = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);

export default function DataGrade({
  snapshot,
  reducedMotion,
}: {
  snapshot: SkySnapshot | null;
  reducedMotion: boolean;
}) {
  const sun = computeSunPhase({
    sunrise: snapshot?.sun.sunrise,
    sunset: snapshot?.sun.sunset,
    isDayHint: snapshot?.current.isDay,
  });
  const cfg = buildAtmosphericConfig(sun, snapshot);
  const a = cfg.accent;
  const accent = `${ch(a[0])}, ${ch(a[1])}, ${ch(a[2])}`;
  const castOpacity = 0.1 + cfg.accentIntensity * 0.12;

  return (
    <div className="pointer-events-none fixed inset-0 z-20" aria-hidden>
      {/* Accent wash from the centre, where the core sits. */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(60% 55% at 50% 48%, rgba(${accent}, ${castOpacity}) 0%, rgba(${accent}, 0) 70%)`,
          mixBlendMode: "screen",
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(125% 125% at 50% 45%, rgba(0,0,0,0) 48%, rgba(2,3,8,0.5) 80%, rgba(0,1,4,0.82) 100%)",
        }}
      />
      {/* Film grain */}
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
