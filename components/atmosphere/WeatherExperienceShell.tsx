"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLiveSeoulWeather } from "@/hooks/useLiveSeoulWeather";
import { useSeoulClock } from "@/hooks/useSeoulClock";
import {
  detectQuality,
  hasWebGL,
  prefersReducedMotion,
  type QualitySettings,
} from "@/components/three/quality";
import { computeSunPhase } from "@/lib/cinematic/seoulTime";
import { buildVisualConfig, readAtmosphere } from "@/lib/atmosphere/weatherVisualConfig";
import type { SkySnapshot, WeatherCondition } from "@/lib/types";
import AtmosphericFieldFallback from "./AtmosphericFieldFallback";
import { WeatherFieldProvider } from "./WeatherFieldContext";

const IS_DEV = process.env.NODE_ENV !== "production";

/**
 * Dev-only `?cond=&hour=` visual-review override (stripped to a no-op in prod, so
 * production behaviour is byte-identical). Lets a reviewer force the atmospheric
 * field to any weather + time-of-day — e.g. `/atmosphere?cond=rain&hour=19` — to
 * audit sunset / fog / snow / night without waiting for live conditions.
 */
interface ReviewOverride {
  cond?: WeatherCondition;
  hour?: number;
}

function parseReview(search: string): ReviewOverride {
  if (!IS_DEV) return {};
  const q = new URLSearchParams(search);
  const cond = q.get("cond");
  const hour = q.get("hour");
  const h = hour == null ? undefined : Number(hour);
  return {
    cond: (cond as WeatherCondition | null) ?? undefined,
    hour: Number.isFinite(h) ? h : undefined,
  };
}

/** Today's Seoul instant at a forced KST hour (dev review only). */
function seoulAtHour(hour: number): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const hh = String(Math.max(0, Math.min(23, Math.floor(hour)))).padStart(2, "0");
  return new Date(`${ymd}T${hh}:00:00+09:00`);
}

/** Overlay a forced condition on a snapshot (dev review only). */
function applyReviewCond(snapshot: SkySnapshot | null, cond?: WeatherCondition): SkySnapshot | null {
  if (!cond || !snapshot) return snapshot;
  return { ...snapshot, current: { ...snapshot.current, condition: cond } };
}

/**
 * The single page shell for the weather experience at /sky. It owns one live
 * data source and ONE atmospheric field (raw-WebGL, or a CSS fallback). Both are
 * created once in the /sky layout and never remount, because the experience is a
 * single non-navigating scroll. The readable foreground (the scroll content) is
 * passed in as `children` and reads the shared state from {@link WeatherFieldProvider}.
 */

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

export default function WeatherExperienceShell({ children }: { children: ReactNode }) {
  const { snapshot, status, lastUpdatedAt } = useLiveSeoulWeather();
  const clock = useSeoulClock();

  const [quality, setQuality] = useState<QualitySettings | null>(null);
  const [reduced, setReduced] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [pointerEnabled, setPointerEnabled] = useState(false);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [review, setReview] = useState<ReviewOverride>({});

  // Client-only capability detection (no SSR/hydration divergence).
  useEffect(() => {
    const reducedNow = prefersReducedMotion();
    setQuality(detectQuality());
    setReduced(reducedNow);
    setWebgl(hasWebGL());
    setReview(parseReview(window.location.search));
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

  // A dev review override (?cond=&hour=) recolours the field for visual audits;
  // in production `review` is always empty, so these collapse to the live values.
  const readout = useMemo(
    () => readAtmosphere(applyReviewCond(snapshot, review.cond)),
    [snapshot, review.cond],
  );

  // Rebuild the visual target on a coarse cadence (every 30s) + on every weather
  // refresh. The background lerps toward it, so steps are invisibly smooth.
  const tick = clock ? Math.floor(clock.getTime() / 30000) : 0;
  const target = useMemo(() => {
    const eff = applyReviewCond(snapshot, review.cond);
    const at =
      review.hour != null ? seoulAtHour(review.hour) : tick > 0 ? new Date(tick * 30000) : new Date();
    const sun = computeSunPhase({
      now: at,
      sunrise: snapshot?.sun.sunrise,
      sunset: snapshot?.sun.sunset,
      isDayHint: review.hour != null ? undefined : snapshot?.current.isDay,
    });
    return buildVisualConfig(sun, eff);
  }, [tick, snapshot, review.cond, review.hour]);

  // Pre-detection (and SSR): a calm loader — no canvas, no hydration mismatch.
  if (!quality) return <Loader />;

  const useFallback = !webgl || canvasFailed;

  return (
    <WeatherFieldProvider value={{ snapshot, status, lastUpdatedAt, readout, target, clock }}>
      {/* Layer 0 — the persistent atmospheric field (WebGL, or CSS fallback). */}
      <div className="fixed inset-0 z-0 bg-[#04060d]">
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

      {/* The scroll content renders its own scrim + readable foreground above
          the shared field. */}
      {children}
    </WeatherFieldProvider>
  );
}
