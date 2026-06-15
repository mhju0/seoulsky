"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useDataRuntime } from "./AtmosphericDataScene";

/**
 * Scroll-driven orbit/dolly around the core. There are no OrbitControls — the
 * camera path is a set of keyframe "tracks" sampled by the global scroll
 * progress, so moving through the page feels like one continuous shot:
 *
 *   ch1 overview  far, easing in as the core assembles
 *   ch2 thermal   tighter, core pushed off-centre to leave room for big type
 *   ch3 wind      orbits to the side to read the ribbons crossing the sphere
 *   ch4 water     closest, drawn into the condensing interior
 *   ch5 orbit     pulls back and lifts to reveal the full forecast orbit
 *
 * Subtle pointer parallax and a slow idle bob add life; both are calmed (parallax
 * to zero) under reduced motion, which also compresses the dolly range.
 */

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Sample evenly-spaced keyframes with smoothstep easing between them. */
function track(s: number, keys: number[]): number {
  const n = keys.length - 1;
  const x = clamp01(s) * n;
  const i = Math.min(n - 1, Math.floor(x));
  return lerp(keys[i], keys[i + 1], smooth(x - i));
}

const DIST = [11.6, 8.0, 8.9, 7.0, 10.6];
const AZIMUTH = [-0.52, -0.12, 0.52, 0.08, -0.22];
const HEIGHT = [1.7, 0.5, 1.2, 0.3, 2.5];
const TARGET_X = [0, -0.62, 0.42, -0.18, 0];
const TARGET_Y = [0, 0.12, 0, -0.22, 0.26];

export default function DataCameraRig() {
  const rt = useDataRuntime();
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const sCam = useRef(0);

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const r = rt.current;
    const reduced = r.reducedMotion;
    const motion = reduced ? 0.45 : 1;

    // Lightly smooth the scroll the camera follows so wheel steps don't jitter.
    sCam.current += (r.scroll - sCam.current) * (1 - Math.exp(-dt / 0.16));
    const s = sCam.current;

    const dist = reduced ? lerp(9.2, track(s, DIST), 0.6) : track(s, DIST);
    const az = track(s, AZIMUTH) * motion + r.pointer[0] * 0.16 * motion;
    const idle = reduced ? 0 : Math.sin(clock.elapsedTime * 0.18) * 0.12;
    const height = track(s, HEIGHT) + idle - r.pointer[1] * 0.35 * motion;

    camera.position.set(Math.sin(az) * dist, height, Math.cos(az) * dist);

    target.set(
      track(s, TARGET_X) * motion + r.pointer[0] * 0.12 * motion,
      track(s, TARGET_Y) * motion,
      0,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
  });

  return null;
}
