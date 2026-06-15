"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLiveSeoulWeather, type WeatherStatus } from "@/hooks/useLiveSeoulWeather";
import { useSeoulClock } from "@/hooks/useSeoulClock";
import {
  detectQuality,
  hasWebGL,
  prefersReducedMotion,
  type QualitySettings,
} from "@/components/three/quality";
import { computeSunPhase } from "@/lib/cinematic/seoulTime";
import { buildVisualConfig, readAtmosphere } from "@/lib/atmosphere/weatherVisualConfig";
import AtmosphericFieldFallback from "./AtmosphericFieldFallback";
import WeatherTextPanel from "./WeatherTextPanel";
import WeatherMetricRail from "./WeatherMetricRail";

// The raw-WebGL field loads client-side only (it touches the GL context on mount).
const AtmosphericFieldBackground = dynamic(() => import("./AtmosphericFieldBackground"), {
  ssr: false,
  loading: () => null,
});

/** Swap to the CSS field if the WebGL background throws at runtime. */
class FieldBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Loader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#04060d]">
      <div className="h-2 w-2 animate-ping rounded-full bg-white/70" />
    </div>
  );
}

function StatusPill({ status }: { status: WeatherStatus }) {
  const label = status === "live" ? "LIVE" : status === "error" ? "CACHED" : "SYNCING";
  const dot = status === "live" ? "bg-emerald-300" : status === "error" ? "bg-amber-300" : "bg-white/60";
  return (
    <div className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${status === "loading" ? "animate-pulse" : ""}`} />
      <span className="text-[10px] uppercase tracking-[0.3em] text-white/55">{label}</span>
    </div>
  );
}

export default function AtmosphericFieldPage() {
  const { snapshot, status } = useLiveSeoulWeather();
  const clock = useSeoulClock();

  const [quality, setQuality] = useState<QualitySettings | null>(null);
  const [reduced, setReduced] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [pointerEnabled, setPointerEnabled] = useState(false);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Client-only capability detection (no SSR/hydration divergence).
  useEffect(() => {
    const reducedNow = prefersReducedMotion();
    setQuality(detectQuality());
    setReduced(reducedNow);
    setWebgl(hasWebGL());
    setPointerEnabled(
      !reducedNow &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: fine)").matches,
    );
  }, []);

  // Pause the GL loop while the tab is hidden (battery / GPU).
  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const readout = useMemo(() => readAtmosphere(snapshot), [snapshot]);

  // Rebuild the visual target on a coarse cadence (every 30s) + on every weather
  // refresh. The background lerps toward it, so steps are invisibly smooth.
  const tick = clock ? Math.floor(clock.getTime() / 30000) : 0;
  const target = useMemo(() => {
    const at = tick > 0 ? new Date(tick * 30000) : new Date();
    const sun = computeSunPhase({
      now: at,
      sunrise: snapshot?.sun.sunrise,
      sunset: snapshot?.sun.sunset,
      isDayHint: snapshot?.current.isDay,
    });
    return buildVisualConfig(sun, snapshot);
  }, [tick, snapshot]);

  // Pre-detection (and SSR): a calm loader — no canvas, no hydration mismatch.
  if (!quality) return <Loader />;

  const useFallback = !webgl || canvasFailed;

  return (
    <main className="relative h-svh w-full overflow-hidden bg-[#04060d] text-white">
      {/* Layer 0 — the atmospheric field (WebGL, or CSS fallback). */}
      <div className="fixed inset-0 z-0">
        {useFallback ? (
          <AtmosphericFieldFallback config={target} reducedMotion={reduced} />
        ) : (
          <FieldBoundary onError={() => setCanvasFailed(true)}>
            <AtmosphericFieldBackground
              target={target}
              quality={quality}
              reducedMotion={reduced}
              paused={hidden}
              pointerEnabled={pointerEnabled}
            />
          </FieldBoundary>
        )}
      </div>

      {/* Layer 1 — directional dark scrim that protects the text zone. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          background:
            "linear-gradient(to top, rgba(4,6,13,0.86) 0%, rgba(4,6,13,0.42) 30%, transparent 62%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 hidden sm:block"
        style={{
          background:
            "linear-gradient(105deg, rgba(4,6,13,0.72) 0%, rgba(4,6,13,0.34) 30%, transparent 55%)",
        }}
      />

      {/* Layer 2 — readable foreground. */}
      <div className="relative z-20 flex h-full flex-col justify-between px-[clamp(1.25rem,5vw,4.5rem)] py-[clamp(1.5rem,5vh,3.25rem)]">
        <header className="flex items-start justify-between">
          <span className="text-[10px] uppercase tracking-[0.34em] text-white/40">
            Atmospheric Field
          </span>
          <StatusPill status={status} />
        </header>

        <div>
          <WeatherTextPanel readout={readout} clock={clock} accent={target.accent} />
          <WeatherMetricRail readout={readout} />
        </div>
      </div>
    </main>
  );
}
