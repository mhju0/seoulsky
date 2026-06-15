"use client";

import type { VisualConfig } from "@/lib/atmosphere/weatherVisualConfig";

/**
 * Pure-CSS Atmospheric Color Field, shown when WebGL is unavailable or the GL
 * background throws. It keeps the same identity — a vertical sky gradient with a
 * warm horizon band, a soft sun glow, drifting cloud-shadow masses and a haze
 * veil — rebuilt from the very same {@link VisualConfig}. Never a blank page.
 *
 * It renders ONLY the background; the readable foreground (text + metrics) is
 * the same in both modes and lives one layer above in the page.
 */

const ch = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);
const rgb = (c: readonly number[], a = 1) => `rgba(${ch(c[0])}, ${ch(c[1])}, ${ch(c[2])}, ${a})`;

export default function AtmosphericFieldFallback({
  config,
  reducedMotion,
}: {
  config: VisualConfig;
  reducedMotion: boolean;
}) {
  const horizonPct = Math.round((1 - config.horizonY) * 100); // CSS y grows downward
  const sunX = Math.round(config.sunPos[0] * 100);
  const sunY = Math.round((1 - config.sunPos[1]) * 100);
  const animate = !reducedMotion;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* vertical sky gradient with the bright horizon band */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, ${rgb(config.skyTop)} 0%, ${rgb(
            config.skyHorizon,
          )} ${horizonPct}%, ${rgb(config.skyBottom)} 100%)`,
        }}
      />
      {/* horizon scatter band — wide, soft, anchored to the right third */}
      <div
        className="absolute inset-x-0 h-[46%]"
        style={{
          top: `${horizonPct - 23}%`,
          background: `radial-gradient(120% 90% at ${sunX}% 60%, ${rgb(
            config.sunColor,
            0.2 * config.sunIntensity,
          )}, transparent 62%)`,
        }}
      />
      {/* sun — small + directional, in the right third (no central blob) */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(${18 + config.lightDiffusion * 16}% ${
            14 + config.lightDiffusion * 12
          }% at ${sunX}% ${sunY}%, ${rgb(config.sunColor, 0.55 * config.sunIntensity)}, transparent 72%)`,
        }}
      />
      {/* one restrained distant ridge / landform just under the horizon */}
      <div
        className="absolute inset-x-0"
        style={{
          top: `${horizonPct - 1}%`,
          height: "10%",
          background: `linear-gradient(to bottom, ${rgb([0.035, 0.045, 0.085], 0.7)} 0%, transparent 90%)`,
        }}
      />
      {/* reflective foreground — a soft mirror of the light low in the frame */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          top: `${horizonPct + 9}%`,
          background: `radial-gradient(60% 90% at ${sunX}% 0%, ${rgb(
            config.sunColor,
            0.16 * config.sunIntensity,
          )}, transparent 70%), linear-gradient(to bottom, ${rgb(config.skyBottom, 0.5)} 0%, rgba(3,5,11,0.55) 100%)`,
        }}
      />
      {/* drifting cloud-shadow masses */}
      {config.cloudShadowStrength > 0.08 && (
        <>
          <div
            className={`haze-layer ${animate ? "" : "!animate-none"}`}
            style={{
              top: "12%",
              left: "8%",
              width: "60%",
              height: "40%",
              background: rgb([0.02, 0.03, 0.07], 0.5 * config.cloudShadowStrength),
              ["--drift-duration" as string]: "120s",
            }}
          />
          <div
            className={`haze-layer ${animate ? "" : "!animate-none"}`}
            style={{
              top: "40%",
              left: "45%",
              width: "55%",
              height: "38%",
              background: rgb([0.02, 0.03, 0.07], 0.42 * config.cloudShadowStrength),
              ["--drift-duration" as string]: "150s",
            }}
          />
        </>
      )}
      {/* haze veil */}
      {config.hazeDensity > 0.1 && (
        <div
          className="absolute inset-0"
          style={{ background: rgb([0.62, 0.66, 0.72], 0.5 * config.hazeDensity) }}
        />
      )}
      {/* settle the edges */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 100% at 50% 45%, transparent 55%, rgba(4,6,13,0.4) 100%)" }}
      />
    </div>
  );
}
