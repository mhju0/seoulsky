"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mulberry32 } from "@/lib/random";
import { activation } from "@/lib/data-experience/chapters";
import { makePuffTexture } from "@/components/three/textures";
import { useDataRuntime } from "../AtmosphericDataScene";

/**
 * Suspended vapour inside the shell. Soft puff billboards (a Points cloud) fill
 * the interior; the visible count and opacity scale with `cloudDensity` and
 * `fogDensity`, so a dry sky shows a sparse-but-intentional haze and an overcast
 * one buries the centre. Emphasised during the SUSPENDED WATER chapter (4).
 */
export default function CloudVolume() {
  const rt = useDataRuntime();
  const max = rt.current.dq.cloudPuffs;

  const tex = useMemo(() => makePuffTexture(), []);
  const geo = useMemo(() => {
    const rand = mulberry32(5150);
    const pos = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) {
      const r = 0.5 + Math.pow(rand(), 0.7) * 1.7;
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(rand() * 2 - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [max]);
  useEffect(
    () => () => {
      tex.dispose();
      geo.dispose();
    },
    [tex, geo],
  );

  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.PointsMaterial>(null);

  useFrame((_, rawDelta) => {
    const c = rt.current.config;
    const reveal = rt.current.reveal;
    const reduced = rt.current.reducedMotion;
    const water = activation(rt.current.scroll, 3);
    // A faint base presence everywhere, lifting strongly in the water chapter.
    const presence = Math.max(c.cloudDensity * 0.4, (c.cloudDensity * 0.6 + c.fogDensity * 0.4) * water);

    if (group.current) {
      if (!reduced) group.current.rotation.y += rawDelta * 0.05;
      group.current.visible = presence > 0.01 && reveal > 0.02;
    }
    if (mat.current) {
      // Vapour tone: bright grey lifting toward the accent in the rim light.
      const a = c.accent;
      mat.current.color.setRGB(
        0.62 + a[0] * 0.18,
        0.66 + a[1] * 0.18,
        0.72 + a[2] * 0.18,
        THREE.SRGBColorSpace,
      );
      mat.current.opacity = Math.min(0.55, presence * 0.6) * reveal;
      mat.current.size = 1.1 + c.fogDensity * 0.6;
    }
    const active = Math.round(max * Math.min(1, 0.25 + presence));
    geo.setDrawRange(0, active);
  });

  return (
    <group ref={group}>
      <points geometry={geo} renderOrder={4} frustumCulled={false}>
        <pointsMaterial
          ref={mat}
          map={tex}
          size={1.2}
          sizeAttenuation
          transparent
          depthWrite={false}
          opacity={0}
        />
      </points>
    </group>
  );
}
