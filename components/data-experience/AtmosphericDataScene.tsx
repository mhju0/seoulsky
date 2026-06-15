"use client";

import { useFrame } from "@react-three/fiber";
import type { MotionValue } from "framer-motion";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { computeSunPhase, type SunPhase } from "@/lib/cinematic/seoulTime";
import {
  buildAtmosphericConfig,
  cloneAtmosphericConfig,
  copyDiscreteAtmosphere,
  lerpAtmosphericConfig,
  type AtmosphericConfig,
} from "@/lib/data-experience/atmosphericConfig";
import { chapterAt } from "@/lib/data-experience/chapters";
import type { SkySnapshot, HourlyForecast } from "@/lib/types";
import type { QualityTier } from "@/components/three/quality";
import { dataQualityFor, type DataQuality } from "./dataQuality";

/**
 * Shared, mutable, allocation-free per-frame state for the ATMOSPHERIC CORE.
 * Children read this inside their own `useFrame`; nothing here triggers a React
 * re-render. `config` is the live (interpolated) look; `target` is where the
 * live data says it should be. `scroll` is the framer-motion scroll progress,
 * read fresh each frame so scrolling never re-renders the React tree.
 */
export interface DataRuntime {
  config: AtmosphericConfig;
  target: AtmosphericConfig;
  sun: SunPhase;
  /** 0..1 global scroll progress across the whole page. */
  scroll: number;
  /** Active chapter index (0..4) and 0..1 progress within it. */
  chapter: number;
  chapterLocal: number;
  /** Seconds since mount — drives the one-time assembly from darkness. */
  introT: number;
  /** 0..1 initial assembly reveal (independent of scroll). */
  reveal: number;
  /** Smoothed pointer parallax, -1..1 on each axis (0 under reduced motion). */
  pointer: [number, number];
  pointerTarget: [number, number];
  reducedMotion: boolean;
  tier: QualityTier;
  dq: DataQuality;
  hourly: HourlyForecast[];
}

const DataRuntimeContext = createContext<MutableRefObject<DataRuntime> | null>(null);

export function useDataRuntime(): MutableRefObject<DataRuntime> {
  const ctx = useContext(DataRuntimeContext);
  if (!ctx) throw new Error("useDataRuntime must be used inside <AtmosphericDataScene>");
  return ctx;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

interface Props {
  snapshot: SkySnapshot | null;
  scrollMV: MotionValue<number>;
  reducedMotion: boolean;
  tier: QualityTier;
  children: ReactNode;
}

export default function AtmosphericDataScene({
  snapshot,
  scrollMV,
  reducedMotion,
  tier,
  children,
}: Props) {
  const snapshotRef = useRef<SkySnapshot | null>(snapshot);
  snapshotRef.current = snapshot;

  const runtime = useRef<DataRuntime>(null!);
  if (runtime.current === null) {
    const sun = computeSunPhase({ now: new Date() });
    const config = buildAtmosphericConfig(sun, snapshot);
    runtime.current = {
      config,
      target: cloneAtmosphericConfig(config),
      sun,
      scroll: 0,
      chapter: 0,
      chapterLocal: 0,
      introT: 0,
      reveal: 0,
      pointer: [0, 0],
      pointerTarget: [0, 0],
      reducedMotion,
      tier,
      dq: dataQualityFor(tier),
      hourly: snapshot?.hourly ?? [],
    };
  }
  runtime.current.reducedMotion = reducedMotion;
  runtime.current.tier = tier;
  runtime.current.dq = dataQualityFor(tier);
  runtime.current.hourly = snapshot?.hourly ?? [];

  // Subtle pointer parallax (disabled under reduced motion). Listens on the
  // window because the canvas sits behind the (pointer-transparent) scroll DOM.
  useEffect(() => {
    if (reducedMotion) {
      runtime.current.pointerTarget = [0, 0];
      return;
    }
    const onMove = (e: PointerEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = (e.clientY / window.innerHeight) * 2 - 1;
      runtime.current.pointerTarget = [x, y];
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reducedMotion]);

  const recompute = useRef(0);

  useFrame((_, rawDelta) => {
    const rt = runtime.current;
    const dt = Math.min(rawDelta, 0.05);

    // 1. Pull the latest scroll progress (no React re-render on scroll).
    // Guard the brief pre-layout window where useScroll can report NaN.
    const sv = scrollMV.get();
    rt.scroll = Number.isFinite(sv) ? Math.max(0, Math.min(1, sv)) : 0;
    const ch = chapterAt(rt.scroll);
    rt.chapter = ch.index;
    rt.chapterLocal = ch.local;

    // 2. Recompute the data-driven target ~1×/s (sun phase drifts, weather refreshes).
    recompute.current += dt;
    if (recompute.current >= 1) {
      recompute.current = 0;
      const snap = snapshotRef.current;
      const sun = computeSunPhase({
        now: new Date(),
        sunrise: snap?.sun.sunrise,
        sunset: snap?.sun.sunset,
        isDayHint: snap?.current.isDay,
      });
      rt.sun = sun;
      rt.target = buildAtmosphericConfig(sun, snap);
      copyDiscreteAtmosphere(rt.config, rt.target);
    }

    // 3. Cross-fade the live config toward the target over a few seconds.
    lerpAtmosphericConfig(rt.config, rt.target, 1 - Math.exp(-dt / 2));

    // 4. One-time assembly out of darkness on first load.
    rt.introT += dt;
    rt.reveal = smoothstep(0, reducedMotion ? 0.8 : 2.4, rt.introT);

    // 5. Smooth pointer parallax toward its target.
    const k = 1 - Math.exp(-dt / 0.25);
    rt.pointer[0] += (rt.pointerTarget[0] - rt.pointer[0]) * k;
    rt.pointer[1] += (rt.pointerTarget[1] - rt.pointer[1]) * k;
  });

  return <DataRuntimeContext.Provider value={runtime}>{children}</DataRuntimeContext.Provider>;
}
