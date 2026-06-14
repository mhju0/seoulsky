"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { useSceneRuntime } from "./SceneDirector";

/**
 * A stabilized cinema-drone / gliding-bird rig. No OrbitControls, no pointer
 * look, no random sine wander. The forward-flight feeling comes from the cloud
 * field streaming past; the camera holds a near-stable horizon and performs a
 * directed opening:
 *
 *   Shot 1 (0–1.5s)  buried in the dark cloud interior, already drifting
 *   Shot 2 (1.5–4s)  rising through vapor, visibility low
 *   Shot 3 (4–7s)    breaks the deck, pitches down to reveal the horizon + city
 *   Shot 4 (7s+)     calm continuous glide with gentle wind-aware banking
 *
 * Everything is driven by the clamped `introT`, so a wake-from-sleep frame can
 * never jump the camera. Reduced-motion calms travel, banking and the ascent.
 */

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

export default function CinematicCameraRig() {
  const rt = useSceneRuntime();
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame(() => {
    const t = rt.current.introT;
    const c = rt.current.config;
    const reduced = rt.current.reducedMotion;
    const motion = reduced ? 0.32 : 1;

    const wind = c.windStrength;
    const windX = c.windVec[0];

    // --- altitude: the breakthrough ascent ---
    let y: number;
    if (reduced) {
      y = lerp(14, 24, smoothstep(0, 1.6, t)) + Math.sin(t * 0.11) * 1.2;
    } else if (t < 3.2) {
      y = lerp(-7, 3, smoothstep(0, 2.4, t));
    } else if (t < 7) {
      y = lerp(3, 28, smoothstep(3.2, 7, t));
    } else {
      y = 28 + Math.sin(t * 0.12) * 3;
    }

    // --- lateral drift, leaning gently into the wind ---
    const x = (Math.sin(t * 0.06) * 6 + windX * wind * 9) * motion;
    const z = Math.sin(t * 0.045) * 2.5 * motion;
    camera.position.set(x, y, z);

    // --- look target: level in the murk, pitching down to reveal on breakout ---
    const revealPitch = smoothstep(reduced ? 0 : 3.6, reduced ? 1.6 : 7.4, t);
    const targetY = lerp(y - 2, -12, revealPitch) + Math.sin(t * 0.1) * 1.2 * motion;
    target.set(-x * 0.3 + Math.sin(t * 0.07) * 4 * motion, targetY, -120);

    // --- banking: gentle roll, biased by the wind, hard-clamped for comfort ---
    const roll = clamp(
      (Math.sin(t * 0.09) * 0.035 + windX * wind * 0.05) * motion,
      -0.09,
      0.09,
    );
    up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.up.copy(up);
    camera.lookAt(target);
  });

  return null;
}
