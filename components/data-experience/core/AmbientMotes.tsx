"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mulberry32 } from "@/lib/random";
import { makeDotTexture } from "@/components/three/textures";
import { useDataRuntime } from "../AtmosphericDataScene";

/**
 * Faint suspended motes drifting in the volume around the core — depth and the
 * "specimen in a chamber" feel. Seeded positions in a spherical shell, additive
 * tiny dots, slow rotation + subtle pointer parallax. Count scales with tier.
 */
export default function AmbientMotes() {
  const rt = useDataRuntime();
  const count = rt.current.dq.motes;

  const dot = useMemo(() => makeDotTexture(), []);
  const geo = useMemo(() => {
    const rand = mulberry32(8123);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Spherical shell, biased outward so the centre stays readable.
      const r = 2.6 + Math.pow(rand(), 0.6) * 4.6;
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(rand() * 2 - 1);
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi) * 0.7;
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);
  useEffect(
    () => () => {
      dot.dispose();
      geo.dispose();
    },
    [dot, geo],
  );

  const group = useRef<THREE.Group>(null);
  const mat = useRef<THREE.PointsMaterial>(null);

  useFrame((_, rawDelta) => {
    const c = rt.current.config;
    const reveal = rt.current.reveal;
    const reduced = rt.current.reducedMotion;
    if (group.current) {
      if (!reduced) group.current.rotation.y += rawDelta * 0.02;
      group.current.rotation.x = rt.current.pointer[1] * 0.05;
      group.current.rotation.z = rt.current.pointer[0] * 0.05;
    }
    if (mat.current) {
      const a = c.accent;
      mat.current.color.setRGB(a[0] * 0.4 + 0.6, a[1] * 0.4 + 0.6, a[2] * 0.4 + 0.6, THREE.SRGBColorSpace);
      mat.current.opacity = (0.16 + c.coreGlow * 0.1) * reveal;
    }
  });

  return (
    <group ref={group}>
      <points geometry={geo} renderOrder={0} frustumCulled={false}>
        <pointsMaterial
          ref={mat}
          map={dot}
          size={0.05}
          sizeAttenuation
          transparent
          depthWrite={false}
          opacity={0}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
