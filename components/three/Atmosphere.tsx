"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mulberry32 } from "@/lib/random";
import { useSceneRuntime } from "./SceneDirector";
import { makeDotTexture, makeGlowTexture } from "./textures";
import type { QualitySettings } from "./quality";

/**
 * The backdrop: a vertex-coloured gradient sky dome (drawn first, no fog so the
 * fog fades distant geometry INTO it), a star shell, and additive sun/moon
 * glows positioned along the key-light direction. Built-in materials only, so
 * tone-mapping and colour management match the rest of the scene exactly.
 */

const DOME_R = 4200;
const STAR_R = 3600;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export default function Atmosphere({ quality }: { quality: QualitySettings }) {
  const rt = useSceneRuntime();

  const glow = useMemo(() => makeGlowTexture(), []);
  const dot = useMemo(() => makeDotTexture(), []);
  useEffect(() => () => { glow.dispose(); dot.dispose(); }, [glow, dot]);

  // Sky dome geometry — we rewrite its per-vertex colours each frame.
  const domeGeo = useMemo(() => {
    const g = new THREE.SphereGeometry(DOME_R, 32, 20);
    const count = g.attributes.position.count;
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, []);
  useEffect(() => () => domeGeo.dispose(), [domeGeo]);

  // Star shell — fixed points on the upper hemisphere; opacity is driven live.
  const starGeo = useMemo(() => {
    const rand = mulberry32(1977);
    const n = quality.stars;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rand();
      const v = rand() * 0.62 + 0.04; // bias toward overhead
      const theta = u * Math.PI * 2;
      const phi = Math.acos(v);
      pos[i * 3] = STAR_R * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = STAR_R * Math.cos(phi);
      pos[i * 3 + 2] = STAR_R * Math.sin(phi) * Math.sin(theta);
      const warm = rand();
      col[i * 3] = 0.85 + warm * 0.15;
      col[i * 3 + 1] = 0.88 + warm * 0.1;
      col[i * 3 + 2] = 1.0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  }, [quality.stars]);
  useEffect(() => () => starGeo.dispose(), [starGeo]);

  const domeRef = useRef<THREE.Mesh>(null);
  const starMat = useRef<THREE.PointsMaterial>(null);
  const sunRef = useRef<THREE.Sprite>(null);
  const moonRef = useRef<THREE.Sprite>(null);
  const moonCore = useRef<THREE.Sprite>(null);
  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    const c = rt.current.config;

    // --- sky gradient ---
    const colAttr = domeGeo.getAttribute("color") as THREE.BufferAttribute;
    const posAttr = domeGeo.getAttribute("position") as THREE.BufferAttribute;
    const top = c.skyTop;
    const mid = c.skyMid;
    const hor = c.skyHorizon;
    for (let i = 0; i < posAttr.count; i++) {
      const ny = posAttr.getY(i) / DOME_R; // -1..1
      let r: number, g: number, b: number;
      if (ny >= 0) {
        const t1 = smoothstep(0, 0.22, ny);
        const lr = mix(hor[0], mid[0], t1);
        const lg = mix(hor[1], mid[1], t1);
        const lb = mix(hor[2], mid[2], t1);
        const t2 = smoothstep(0.16, 0.78, ny);
        r = mix(lr, top[0], t2);
        g = mix(lg, top[1], t2);
        b = mix(lb, top[2], t2);
      } else {
        const t = smoothstep(0, 0.55, -ny);
        r = hor[0] * (1 - 0.32 * t);
        g = hor[1] * (1 - 0.32 * t);
        b = hor[2] * (1 - 0.32 * t);
      }
      tmp.setRGB(r, g, b, THREE.SRGBColorSpace);
      colAttr.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    colAttr.needsUpdate = true;

    // --- stars ---
    if (starMat.current) {
      const twinkle = 0.9 + 0.1 * Math.sin(clock.elapsedTime * 1.7);
      starMat.current.opacity = c.starOpacity * twinkle;
      starMat.current.visible = c.starOpacity > 0.01;
    }

    // --- sun & moon glows along the key-light direction ---
    const d = c.lightDir;
    if (sunRef.current) {
      sunRef.current.position.set(d[0] * 3400, d[1] * 3400, d[2] * 3400);
      const s = 360 + c.sunGlow * 520;
      sunRef.current.scale.set(s, s, 1);
      (sunRef.current.material as THREE.SpriteMaterial).color.setRGB(
        c.sunGlowColor[0], c.sunGlowColor[1], c.sunGlowColor[2], THREE.SRGBColorSpace,
      );
      (sunRef.current.material as THREE.SpriteMaterial).opacity = c.sunGlow;
      sunRef.current.visible = c.sunGlow > 0.01;
    }
    if (moonRef.current && moonCore.current) {
      moonRef.current.position.set(d[0] * 3300, d[1] * 3300, d[2] * 3300);
      moonRef.current.scale.set(380, 380, 1);
      (moonRef.current.material as THREE.SpriteMaterial).opacity = c.moonGlow * 0.7;
      moonRef.current.visible = c.moonGlow > 0.01;
      moonCore.current.position.copy(moonRef.current.position);
      moonCore.current.scale.set(70, 70, 1);
      (moonCore.current.material as THREE.SpriteMaterial).opacity = c.moonGlow;
      moonCore.current.visible = c.moonGlow > 0.01;
    }
  });

  return (
    <group>
      <mesh ref={domeRef} geometry={domeGeo} renderOrder={-1000} frustumCulled={false}>
        <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
      </mesh>

      <points geometry={starGeo} renderOrder={-900} frustumCulled={false}>
        <pointsMaterial
          ref={starMat}
          map={dot}
          size={7}
          sizeAttenuation={false}
          vertexColors
          transparent
          depthWrite={false}
          fog={false}
          opacity={0}
        />
      </points>

      <sprite ref={sunRef} renderOrder={-850}>
        <spriteMaterial
          map={glow}
          transparent
          depthWrite={false}
          depthTest={false}
          fog={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      <sprite ref={moonRef} renderOrder={-850}>
        <spriteMaterial
          map={glow}
          transparent
          depthWrite={false}
          depthTest={false}
          fog={false}
          toneMapped={false}
          color={"#cdd7ee"}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite ref={moonCore} renderOrder={-849}>
        <spriteMaterial
          map={glow}
          transparent
          depthWrite={false}
          depthTest={false}
          fog={false}
          toneMapped={false}
          color={"#eef2ff"}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}
