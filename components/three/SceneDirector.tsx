"use client";

import { useFrame, useThree } from "@react-three/fiber";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { computeSunPhase, type SunPhase } from "@/lib/cinematic/seoulTime";
import {
  buildSceneConfig,
  cloneSceneConfig,
  initialSceneConfig,
  lerpSceneConfig,
  normalizeWeather,
  type SceneConfig,
} from "@/lib/cinematic/weatherSceneConfig";
import type { SkySnapshot } from "@/lib/types";
import type { QualityTier } from "./quality";

/**
 * Shared, mutable, allocation-free per-frame state. Children read this in their
 * own useFrame; nothing here triggers a React re-render. `config` is the live
 * (interpolated) look; `target` is where the data says it should be.
 */
export interface SceneRuntime {
  config: SceneConfig;
  target: SceneConfig;
  sun: SunPhase;
  /** Seconds since the scene mounted — drives the opening timeline. */
  introT: number;
  /** 0 = clear sky · 1 = buried inside the cloud layer (opening shots 1–2). */
  immersion: number;
  reducedMotion: boolean;
  tier: QualityTier;
  /** Accumulated cloud-streaming distance + lateral wind drift (world units). */
  travel: number;
  windOffset: [number, number];
}

const SceneRuntimeContext = createContext<MutableRefObject<SceneRuntime> | null>(null);

export function useSceneRuntime(): MutableRefObject<SceneRuntime> {
  const ctx = useContext(SceneRuntimeContext);
  if (!ctx) throw new Error("useSceneRuntime must be used inside <SceneDirector>");
  return ctx;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

interface Props {
  snapshot: SkySnapshot | null;
  tier: QualityTier;
  reducedMotion: boolean;
  children: ReactNode;
}

export default function SceneDirector({ snapshot, tier, reducedMotion, children }: Props) {
  const { scene, gl } = useThree();
  const snapshotRef = useRef<SkySnapshot | null>(snapshot);
  snapshotRef.current = snapshot;

  const runtime = useRef<SceneRuntime>(null!);
  if (runtime.current === null) {
    const sun = computeSunPhase({ now: new Date() });
    const config = initialSceneConfig(sun);
    runtime.current = {
      config,
      target: cloneSceneConfig(config),
      sun,
      introT: 0,
      immersion: 1,
      reducedMotion,
      tier,
      travel: 0,
      windOffset: [0, 0],
    };
  }
  runtime.current.reducedMotion = reducedMotion;
  runtime.current.tier = tier;

  // Linear fog owned here; near/far/colour are written every frame.
  const fog = useMemo(() => new THREE.Fog(0x10131c, 10, 800), []);
  useEffect(() => {
    scene.fog = fog;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    return () => {
      scene.fog = null;
    };
  }, [scene, gl, fog]);

  const recomputeTarget = useRef(0);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const tmpColor2 = useMemo(() => new THREE.Color(), []);

  useFrame((_, rawDelta) => {
    const rt = runtime.current;
    // Clamp dt so a wake-from-sleep frame doesn't fling the camera/clouds.
    const dt = Math.min(rawDelta, 0.05);

    // 1. Recompute the data-driven target a few times per second (not per frame).
    recomputeTarget.current += dt;
    if (recomputeTarget.current >= 1.2) {
      recomputeTarget.current = 0;
      const snap = snapshotRef.current;
      const sun = computeSunPhase({
        now: new Date(),
        sunrise: snap?.sun.sunrise,
        sunset: snap?.sun.sunset,
        isDayHint: snap?.current.isDay,
      });
      rt.sun = sun;
      rt.target = buildSceneConfig(sun, normalizeWeather(snap?.current ?? null, snap?.air ?? null));
    }

    // 2. Cross-fade the live config toward the target over a few seconds.
    lerpSceneConfig(rt.config, rt.target, 1 - Math.exp(-dt / 2.2));
    const cfg = rt.config;

    // 3. Opening timeline → cloud immersion (dense fog while inside the deck).
    rt.introT += dt;
    const t = rt.introT;
    if (reducedMotion) {
      rt.immersion = t < 1.4 ? 1 - smoothstep(0, 1.4, t) : 0;
    } else if (t < 3.2) {
      rt.immersion = 1;
    } else if (t < 7) {
      rt.immersion = 1 - smoothstep(3.2, 7, t);
    } else {
      rt.immersion = 0;
    }

    // 4. Forward streaming + lateral wind drift for the cloud field.
    const speed = (reducedMotion ? 8 : 22) * (0.7 + cfg.windStrength * 0.6);
    rt.travel += dt * speed;
    rt.windOffset[0] += dt * cfg.windVec[0] * cfg.windStrength * 9;
    rt.windOffset[1] += dt * cfg.windVec[1] * cfg.windStrength * 9;

    // 5. Fog: blend the configured atmosphere with the dense in-cloud fog.
    const im = rt.immersion;
    fog.near = THREE.MathUtils.lerp(cfg.fogNear, 0.5, im);
    fog.far = THREE.MathUtils.lerp(cfg.fogFar, 34, im);
    tmpColor.setRGB(cfg.fogColor[0], cfg.fogColor[1], cfg.fogColor[2]);
    // Inside the cloud the fog takes the cloud's own (slightly lifted) shadow tone.
    tmpColor2.setRGB(
      cfg.cloudShadow[0] + 0.06,
      cfg.cloudShadow[1] + 0.07,
      cfg.cloudShadow[2] + 0.09,
    );
    tmpColor.lerp(tmpColor2, im * 0.8);
    fog.color.copy(tmpColor);

    // 6. Smooth exposure, with a gentle lift out of the opening darkness.
    const wake = smoothstep(0, 2.4, t);
    gl.toneMappingExposure = cfg.exposure * (0.5 + 0.5 * wake);
  });

  return <SceneRuntimeContext.Provider value={runtime}>{children}</SceneRuntimeContext.Provider>;
}
