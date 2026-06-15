"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mulberry32 } from "@/lib/random";
import { useSceneRuntime } from "./SceneDirector";
import { makeDotTexture, makeHorizonGlowTexture } from "./textures";
import type { QualitySettings } from "./quality";

/**
 * The far horizon — NO buildings, towers, river or recognizable skyline. Seoul
 * itself lives in the cinematic video plate (hybrid mode); in the procedural
 * fallback it is left to the atmosphere. All this layer ever draws is light:
 *
 *   • a soft horizon glow band, low and far (warm city-light dome at night, a
 *     pale haze band by day) — additive, no edges, no structure,
 *   • atmospheric horizon haze tinted by the live fog colour,
 *   • optional tiny distant light specks at night — a faint, sparse scatter far
 *     below the horizon, far too small and random to ever read as a building.
 *
 * Nothing sits near the centre of frame and nothing is opaque. In hybrid mode
 * the whole group is hidden (the footage is the world); in procedural mode it
 * keeps the lower frame dark, soft and alive without a single hard shape.
 */

// Far away and low so it compresses onto the horizon line — never an object in
// the camera's path. (The rig glides at altitude looking gently down, so the
// true horizon sits high; this glow hugs it.)
const HORIZON_Y = -160;
const HORIZON_Z = -2400;
const GLOW_W = 5200;
const GLOW_H = 900;

export default function SeoulHorizon({ quality }: { quality: QualitySettings }) {
  const rt = useSceneRuntime();
  const groupRef = useRef<THREE.Group>(null);
  const hazeMat = useRef<THREE.MeshBasicMaterial>(null);
  const glowMat = useRef<THREE.MeshBasicMaterial>(null);
  const specksMat = useRef<THREE.PointsMaterial>(null);

  const glowTex = useMemo(() => makeHorizonGlowTexture(), []);
  const dot = useMemo(() => makeDotTexture(), []);
  useEffect(
    () => () => {
      glowTex.dispose();
      dot.dispose();
    },
    [glowTex, dot],
  );

  // A faint, sparse scatter of distant lights hugging the horizon band. Random
  // placement + tiny size means it never aligns into anything skyline-like.
  const specksGeo = useMemo(() => {
    const n = Math.min(220, Math.max(60, Math.round(quality.stars * 0.12)));
    const rand = mulberry32(7321);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rand() * 2 - 1) * GLOW_W * 0.42;
      pos[i * 3 + 1] = HORIZON_Y - 30 + rand() * 90; // hug the horizon line
      pos[i * 3 + 2] = HORIZON_Z + (rand() * 2 - 1) * 280;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [quality.stars]);
  useEffect(() => () => specksGeo.dispose(), [specksGeo]);

  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const c = rt.current.config;
    // In hybrid mode the cinematic video plate IS Seoul — hide the whole layer
    // and skip its per-frame work entirely. Never two worlds at once.
    const hybrid = rt.current.renderMode === "hybrid";
    if (groupRef.current) groupRef.current.visible = !hybrid;
    if (hybrid) return;

    // Horizon haze — a pale atmospheric band present day and night, scaled by
    // how murky the air reads and faded out as visibility drops.
    if (hazeMat.current) {
      tmp.setRGB(c.fogColor[0], c.fogColor[1], c.fogColor[2], THREE.SRGBColorSpace);
      hazeMat.current.color.copy(tmp);
      hazeMat.current.opacity = (0.08 + c.haze * 0.3) * c.cityVisibility;
    }

    // City glow — a warm light-pollution dome at night, a whisper by day. Pure
    // additive light, no geometry that could read as a building.
    if (glowMat.current) {
      tmp.setRGB(c.cityGlow[0], c.cityGlow[1], c.cityGlow[2], THREE.SRGBColorSpace);
      glowMat.current.color.copy(tmp);
      glowMat.current.opacity = (0.05 + c.cityLight * 0.5) * c.cityVisibility;
    }

    // Distant light specks — night only, tiny and faint.
    if (specksMat.current) {
      tmp.setRGB(c.cityGlow[0], c.cityGlow[1], c.cityGlow[2], THREE.SRGBColorSpace);
      specksMat.current.color.copy(tmp);
      const a = c.cityLight * c.cityVisibility;
      specksMat.current.opacity = a * 0.75;
      specksMat.current.visible = a > 0.03;
    }
  });

  return (
    <group ref={groupRef} renderOrder={0}>
      {/* Warm city-glow dome — widest + softest, drawn first. */}
      <mesh position={[0, HORIZON_Y, HORIZON_Z]}>
        <planeGeometry args={[GLOW_W * 1.18, GLOW_H * 1.5]} />
        <meshBasicMaterial
          ref={glowMat}
          map={glowTex}
          transparent
          depthWrite={false}
          fog={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          opacity={0}
        />
      </mesh>

      {/* Atmospheric horizon haze band (fog-tinted). */}
      <mesh position={[0, HORIZON_Y + 40, HORIZON_Z + 40]}>
        <planeGeometry args={[GLOW_W, GLOW_H]} />
        <meshBasicMaterial
          ref={hazeMat}
          map={glowTex}
          transparent
          depthWrite={false}
          fog={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          opacity={0}
        />
      </mesh>

      {/* Tiny distant light specks — night only. */}
      <points geometry={specksGeo} frustumCulled={false}>
        <pointsMaterial
          ref={specksMat}
          map={dot}
          size={5}
          sizeAttenuation
          transparent
          depthWrite={false}
          fog={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
          opacity={0}
        />
      </points>
    </group>
  );
}
