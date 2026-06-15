"use client";

import { Canvas } from "@react-three/fiber";
import type { MotionValue } from "framer-motion";
import * as THREE from "three";
import type { QualitySettings } from "@/components/three/quality";
import type { SkySnapshot } from "@/lib/types";
import AtmosphericCore from "./AtmosphericCore";
import AtmosphericDataScene from "./AtmosphericDataScene";
import DataCameraRig from "./DataCameraRig";

interface Props {
  snapshot: SkySnapshot | null;
  scrollMV: MotionValue<number>;
  quality: QualitySettings;
  reducedMotion: boolean;
  /** Flipped to "never" when the tab is hidden, so the loop pauses off-screen. */
  frameloop: "always" | "never";
  onReady?: () => void;
}

/**
 * The transparent WebGL viewport for the data experience. Mounted client-only
 * (ssr disabled) and created exactly once — scroll only mutates refs/MotionValues
 * inside, so the canvas is never recreated during ordinary scrolling. ACES tone
 * mapping with a transparent clear lets the page's near-black + accent wash show
 * through behind the core.
 */
export default function AtmosphericDataCanvas({
  snapshot,
  scrollMV,
  quality,
  reducedMotion,
  frameloop,
  onReady,
}: Props) {
  return (
    <Canvas
      frameloop={frameloop}
      dpr={quality.dpr}
      gl={{ antialias: quality.antialias, powerPreference: "high-performance", alpha: true }}
      camera={{ fov: 38, near: 0.1, far: 120, position: [0, 1.7, 11.6] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.setClearColor(0x000000, 0);
        onReady?.();
      }}
    >
      <AtmosphericDataScene
        snapshot={snapshot}
        scrollMV={scrollMV}
        reducedMotion={reducedMotion}
        tier={quality.tier}
      >
        <DataCameraRig />
        <AtmosphericCore hourly={snapshot?.hourly ?? []} />
      </AtmosphericDataScene>
    </Canvas>
  );
}
