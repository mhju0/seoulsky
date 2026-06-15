"use client";

import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import type { SkySnapshot } from "@/lib/types";
import Atmosphere from "./Atmosphere";
import CinematicCameraRig from "./CinematicCameraRig";
import CloudField from "./CloudField";
import SceneDirector from "./SceneDirector";
import SeoulHorizon from "./SeoulHorizon";
import WeatherLighting from "./WeatherLighting";
import WeatherParticles from "./WeatherParticles";
import type { QualitySettings } from "./quality";

interface Props {
  snapshot: SkySnapshot | null;
  quality: QualitySettings;
  reducedMotion: boolean;
  /**
   * "procedural" = the full self-contained sky (opaque dome + clouds + city).
   * "hybrid" = composited transparently over a cinematic video plate: the dome,
   * stars, distant cloud banks and city are dropped (the footage provides them)
   * and only the live near-camera atmosphere is drawn.
   */
  renderMode?: "procedural" | "hybrid";
  onReady?: () => void;
}

/**
 * The full-screen real-time scene. Mounted client-only (ssr disabled) by the
 * page. ~28–30mm-equivalent FOV, a deep far plane so the sky dome and distant
 * city read at true scale, ACES tone mapping with live exposure.
 *
 * The canvas is created with `alpha: true` and a transparent clear in BOTH
 * modes. In procedural mode the opaque sky dome (rendered first, around the
 * camera) covers every pixel, so it looks identical to an opaque canvas; in
 * hybrid mode the dome is hidden and the transparent clear lets the video plate
 * beneath show through. Keeping alpha constant means a mode switch never needs
 * to recreate the WebGL context (no remount, no replayed opening).
 *
 * The cinematic grade is achieved WITHOUT a full-screen postprocessing pass:
 * ACES tone mapping + live exposure (driven in SceneDirector), additive sun/moon
 * glow sprites that stand in for bloom (Atmosphere), atmospheric fog for depth,
 * and a lightweight CSS vignette + film-grain overlay (CinematicGrade) painted
 * over the canvas by the page. This avoids @react-three/postprocessing, whose
 * EffectComposer serialized R3F instance state (circular children/parent) under
 * React 19 + fiber 9 and crashed the whole scene.
 */
export default function SeoulSkyCanvas({
  snapshot,
  quality,
  reducedMotion,
  renderMode = "procedural",
  onReady,
}: Props) {
  return (
    <Canvas
      frameloop="always"
      dpr={quality.dpr}
      gl={{ antialias: quality.antialias, powerPreference: "high-performance", alpha: true }}
      camera={{ fov: 46, near: 0.5, far: 6000, position: [0, 12, 0] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 0.6;
        // Transparent clear; the opaque dome covers it in procedural mode, the
        // video plate shows through it in hybrid mode.
        gl.setClearColor(0x000000, 0);
        onReady?.();
      }}
    >
      <SceneDirector
        snapshot={snapshot}
        tier={quality.tier}
        reducedMotion={reducedMotion}
        renderMode={renderMode}
      >
        <CinematicCameraRig />
        <WeatherLighting />
        <Atmosphere quality={quality} />
        <CloudField quality={quality} />
        <SeoulHorizon quality={quality} />
        <WeatherParticles quality={quality} />
      </SceneDirector>
    </Canvas>
  );
}
