"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { makeGlowTexture } from "@/components/three/textures";
import { useDataRuntime } from "../AtmosphericDataScene";

/**
 * The luminous nucleus: a wide additive halo + a tight bright core sprite, both
 * tinted by the live accent and breathing slowly. Purely additive (self-lit), so
 * it reads as internal glow regardless of scene lighting. Fades in with the
 * one-time assembly reveal.
 */
export default function CoreLight() {
  const rt = useDataRuntime();
  const glow = useMemo(() => makeGlowTexture(), []);
  useEffect(() => () => glow.dispose(), [glow]);

  const halo = useRef<THREE.Sprite>(null);
  const core = useRef<THREE.Sprite>(null);

  useFrame(({ clock }) => {
    const c = rt.current.config;
    const reveal = rt.current.reveal;
    const a = c.accent;
    const pulse = 0.92 + Math.sin(clock.elapsedTime * 0.85) * 0.08;

    if (halo.current) {
      const s = (2.6 + c.coreGlow * 2.8) * pulse;
      halo.current.scale.set(s, s, 1);
      const m = halo.current.material as THREE.SpriteMaterial;
      m.color.setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace);
      m.opacity = c.coreGlow * 0.5 * reveal;
    }
    if (core.current) {
      const s = (0.85 + c.coreGlow * 0.5) * pulse;
      core.current.scale.set(s, s, 1);
      const m = core.current.material as THREE.SpriteMaterial;
      // Whiter hot centre so it doesn't read as a flat coloured dot.
      m.color.setRGB(a[0] * 0.5 + 0.5, a[1] * 0.5 + 0.5, a[2] * 0.5 + 0.5, THREE.SRGBColorSpace);
      m.opacity = c.coreGlow * 0.95 * reveal;
    }
  });

  return (
    <group>
      <sprite ref={halo} renderOrder={-20}>
        <spriteMaterial
          map={glow}
          transparent
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite ref={core} renderOrder={6}>
        <spriteMaterial
          map={glow}
          transparent
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}
