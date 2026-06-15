"use client";

import { useSeoulClock } from "@/hooks/useSeoulClock";
import { computeSunPhase } from "@/lib/cinematic/seoulTime";
import {
  buildSceneConfig,
  normalizeWeather,
  type RGB,
} from "@/lib/cinematic/weatherSceneConfig";
import type { SkySnapshot } from "@/lib/types";
import WeatherParticles from "./WeatherParticles";

/**
 * Shown when WebGL is unavailable or the 3D scene fails to initialise. It reuses
 * the exact same {@link buildSceneConfig} palette as the 3D scene, so it still
 * reflects Seoul's current time-of-day, daylight phase and weather — just in 2D
 * (CSS gradient + glow + the existing CSS particles + a soft horizon glow). No
 * buildings or skyline. Never a blank page, raw error, or stuck loader.
 */

const rgb = (c: RGB) =>
  `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;

export default function WebGLFallback({ snapshot }: { snapshot: SkySnapshot | null }) {
  const now = useSeoulClock();
  const sun = computeSunPhase({
    now: now ?? new Date(),
    sunrise: snapshot?.sun.sunrise,
    sunset: snapshot?.sun.sunset,
    isDayHint: snapshot?.current.isDay,
  });
  const cfg = buildSceneConfig(sun, normalizeWeather(snapshot?.current ?? null, snapshot?.air ?? null));

  const glowLeft = 50 + cfg.lightDir[0] * 36;
  const glowTop = 40 - sun.elevation * 28;
  const glowColor = sun.isDay ? cfg.sunGlowColor : ([0.8, 0.85, 1] as RGB);
  const glowOpacity = Math.max(cfg.sunGlow, cfg.moonGlow * 0.7);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0 transition-[background] duration-1000"
        style={{
          background: `linear-gradient(180deg, ${rgb(cfg.skyTop)} 0%, ${rgb(cfg.skyMid)} 52%, ${rgb(
            cfg.skyHorizon,
          )} 100%)`,
        }}
      />
      <div
        className="absolute h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl"
        style={{
          left: `${glowLeft}%`,
          top: `${glowTop}%`,
          background: `radial-gradient(circle, ${rgb(glowColor)}, transparent 65%)`,
          opacity: glowOpacity,
        }}
      />

      <WeatherParticles
        rain={Math.round(cfg.rain * 110)}
        snow={Math.round(cfg.snow * 70)}
        stars={Math.round(cfg.starOpacity * 110)}
        windKmh={snapshot?.current.windSpeed ?? 0}
      />

      {/* Horizon glow + atmospheric haze — no buildings, no skyline. */}
      <div className="absolute inset-x-0 bottom-0 h-[42vh]">
        {/* warm city light-pollution glow, strongest at night */}
        <div
          className="absolute inset-x-0 bottom-0 h-full"
          style={{
            background: `radial-gradient(ellipse 90% 72% at 50% 120%, ${rgb(cfg.cityGlow)}, transparent 68%)`,
            opacity: cfg.cityLight * cfg.cityVisibility * 0.6,
          }}
        />
        {/* pale atmospheric haze band hugging the horizon */}
        <div
          className="absolute inset-x-0 bottom-0 h-[62%]"
          style={{
            background: `linear-gradient(to top, ${rgb(cfg.fogColor)}, transparent)`,
            opacity: (0.12 + cfg.haze * 0.3) * cfg.cityVisibility,
          }}
        />
      </div>

      {/* vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(120% 95% at 50% 25%, transparent 45%, rgba(0,0,0,0.5) 100%)",
        }}
      />
    </div>
  );
}
