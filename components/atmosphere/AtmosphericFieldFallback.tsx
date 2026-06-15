"use client";

import { useEffect, useRef } from "react";
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

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const luma = (c: readonly number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// The three altitude-zone weights, identical to the WebGL ramp (task 1.2): a
// crest at the top, a soft cloud-deck peak near 0.45, a settle to the ground.
const altitudeZones = (s: number) => ({
  high: 1 - smoothstep(0, 0.42, s),
  deck: Math.exp(-Math.pow((s - 0.45) / 0.2, 2)),
  ground: smoothstep(0.5, 1, s),
});

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
  const rootRef = useRef<HTMLDivElement>(null);

  // Mirror the WebGL altitude re-grade: a throttled (rAF-coalesced) passive
  // scroll handler writes the zone weights into CSS custom properties the
  // overlay layers read — no React re-render per frame. Under reduced motion we
  // set the current altitude once and HOLD it (parity with the WebGL field,
  // which leaves uScroll steady): a calm field, information fully readable.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const apply = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const z = altitudeZones(max > 0 ? clamp01(window.scrollY / max) : 0);
      el.style.setProperty("--alt-high", String(z.high));
      el.style.setProperty("--alt-deck", String(z.deck));
      el.style.setProperty("--alt-ground", String(z.ground));
    };
    apply();
    if (reducedMotion) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        apply();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [reducedMotion]);

  // Altitude palette stops, derived from the SAME live-weather config as the
  // WebGL ramp so the 2D look matches: a deep upper-sky deepen (sky-top hue), a
  // cloud-deck fog of the sky's own luminance, and a warm sun-tinted urban glow.
  const fogTarget = clamp01(luma(config.skyHorizon) * 1.3 + 0.08);
  const deckFog = rgb([0, 1, 2].map((i) => lerp(config.skyHorizon[i], fogTarget, 0.7)));
  const urban = rgb([0, 1, 2].map((i) => lerp(config.sunColor[i], [1, 0.74, 0.45][i], 0.4)));
  const deepUpper = rgb(config.skyTop);
  // A short opacity transition damps the per-frame var updates so the 2D shift
  // eases like the WebGL lerp; disabled under reduced motion (held steady).
  const altTransition = animate ? "opacity 220ms ease-out" : undefined;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 overflow-hidden"
      style={{
        // baseline = top of atmosphere (scroll 0); the effect updates these.
        ["--alt-high" as string]: "1",
        ["--alt-deck" as string]: "0",
        ["--alt-ground" as string]: "0",
      }}
    >
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

      {/* === ALTITUDE RAMP (task 1.3) — mirrors the WebGL u_scroll re-grade ==== */}
      {/* high, thin air: deepen toward the upper-sky hue for a clean deep top */}
      <div
        className="absolute inset-0"
        style={{ background: deepUpper, opacity: "calc(var(--alt-high) * 0.06)", transition: altTransition }}
      />
      {/* cloud deck: a soft haze of the sky's own light, peak mid-scroll. Tuned
          down (was 0.85) for parity with the gentler WebGL whiteout — readable,
          not disorienting on mobile. */}
      <div
        className="absolute inset-0"
        style={{ background: deckFog, opacity: "calc(var(--alt-deck) * 0.6)", transition: altTransition }}
      />
      {/* ground: a warm horizon band, tinted by the live sun colour */}
      <div
        className="absolute inset-x-0"
        style={{
          top: `${horizonPct - 12}%`,
          height: "30%",
          background: `radial-gradient(120% 100% at ${sunX}% 50%, ${urban}, transparent 70%)`,
          opacity: "calc(var(--alt-ground) * 0.35)",
          transition: altTransition,
        }}
      />
      {/* ground: a faint distant urban glow rising from the bottom edge */}
      <div
        className="absolute inset-x-0 bottom-0 h-[34%]"
        style={{
          background: `linear-gradient(to top, ${urban}, transparent 100%)`,
          opacity: "calc(var(--alt-ground) * 0.28)",
          transition: altTransition,
        }}
      />
    </div>
  );
}
