"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useSceneRuntime } from "./SceneDirector";
import { makePuffTexture } from "./textures";
import type { QualitySettings } from "./quality";

/**
 * Three depth zones of cloud:
 *   • far  — distant, hazy banks near the horizon (size-attenuated points)
 *   • mid  — the main formations the camera flies among (points)
 *   • near — large camera-facing vapor planes that streak past the lens
 *
 * Points use size attenuation, so closer puffs are genuinely larger on screen
 * (real parallax: near streams past faster than far). Each zone recycles within
 * its own depth band so the world feels endless without obvious repetition.
 * Density follows live cloud cover; colour follows the lit/shadow config, which
 * carries time-of-day edge lighting and precipitation darkening.
 */

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const rnd = () => Math.random();

interface ZoneSpec {
  count: number;
  size: number;
  halfX: number;
  yMin: number;
  yMax: number;
  zBack: number;
  zFront: number;
  speedMul: number;
  minVisible: number;
  opacityScale: number;
  renderOrder: number;
}

function seedZone(z: ZoneSpec) {
  const pos = new Float32Array(z.count * 3);
  const shade = new Float32Array(z.count);
  const clusters = Math.max(5, Math.round(z.count / 8));
  const centers: [number, number, number][] = [];
  for (let i = 0; i < clusters; i++) {
    centers.push([
      (rnd() * 2 - 1) * z.halfX,
      z.yMin + rnd() * (z.yMax - z.yMin),
      z.zBack + rnd() * (z.zFront - z.zBack),
    ]);
  }
  for (let i = 0; i < z.count; i++) {
    const c = centers[i % clusters];
    const ox = (rnd() + rnd() - 1) * z.halfX * 0.22;
    const oy = (rnd() + rnd() - 1) * (z.yMax - z.yMin) * 0.2;
    const oz = (rnd() + rnd() - 1) * (z.zFront - z.zBack) * 0.08;
    const x = c[0] + ox;
    const y = Math.min(z.yMax, Math.max(z.yMin, c[1] + oy));
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = c[2] + oz;
    const ny = (y - z.yMin) / (z.yMax - z.yMin);
    shade[i] = clamp01(0.32 + 0.52 * ny + 0.3 * (rnd() - 0.3));
  }
  return { pos, shade };
}

function CloudPoints({ spec, tex }: { spec: ZoneSpec; tex: THREE.Texture }) {
  const rt = useSceneRuntime();
  const matRef = useRef<THREE.PointsMaterial>(null);
  const prev = useRef({ travel: 0, wx: 0, wz: 0 });

  const { geo, shade } = useMemo(() => {
    const seeded = seedZone(spec);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(seeded.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(spec.count * 3), 3));
    return { geo: g, shade: seeded.shade };
  }, [spec]);
  useEffect(() => () => geo.dispose(), [geo]);

  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const c = rt.current.config;
    const span = spec.zFront - spec.zBack;
    const fwd = (rt.current.travel - prev.current.travel) * spec.speedMul;
    const dwx = (rt.current.windOffset[0] - prev.current.wx) * spec.speedMul;
    const dwz = (rt.current.windOffset[1] - prev.current.wz) * spec.speedMul;
    prev.current.travel = rt.current.travel;
    prev.current.wx = rt.current.windOffset[0];
    prev.current.wz = rt.current.windOffset[1];

    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = geo.getAttribute("color") as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < spec.count; i++) {
      let z = arr[i * 3 + 2] + fwd + dwz;
      let x = arr[i * 3] + dwx;
      if (z > spec.zFront) {
        z -= span;
        x = (rnd() * 2 - 1) * spec.halfX;
        arr[i * 3 + 1] = spec.yMin + rnd() * (spec.yMax - spec.yMin);
      }
      arr[i * 3] = x;
      arr[i * 3 + 2] = z;
      tmp.setRGB(
        c.cloudShadow[0] + (c.cloudLit[0] - c.cloudShadow[0]) * shade[i],
        c.cloudShadow[1] + (c.cloudLit[1] - c.cloudShadow[1]) * shade[i],
        c.cloudShadow[2] + (c.cloudLit[2] - c.cloudShadow[2]) * shade[i],
        THREE.SRGBColorSpace,
      );
      colAttr.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    const visible = Math.round(
      spec.count * (spec.minVisible + (1 - spec.minVisible) * c.cloudCover),
    );
    geo.setDrawRange(0, visible);
    if (matRef.current) matRef.current.opacity = c.cloudOpacity * spec.opacityScale;
  });

  return (
    <points geometry={geo} renderOrder={spec.renderOrder} frustumCulled={false}>
      <pointsMaterial
        ref={matRef}
        map={tex}
        size={spec.size}
        sizeAttenuation
        vertexColors
        transparent
        depthWrite={false}
        opacity={0}
      />
    </points>
  );
}

function ForegroundVapor({ count, tex }: { count: number; tex: THREE.Texture }) {
  const rt = useSceneRuntime();
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const prev = useRef({ travel: 0, wx: 0, wz: 0 });
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const mat = useMemo(
    () => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.25 }),
    [tex],
  );
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );

  const planes = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: (rnd() * 2 - 1) * 180,
        y: (rnd() * 2 - 1) * 60,
        z: -220 + rnd() * 260,
        s: 130 + rnd() * 150,
      })),
    [count],
  );

  useFrame(() => {
    const c = rt.current.config;
    const fwd = (rt.current.travel - prev.current.travel) * 1.35;
    const dwx = (rt.current.windOffset[0] - prev.current.wx) * 1.35;
    const dwz = (rt.current.windOffset[1] - prev.current.wz) * 1.35;
    prev.current.travel = rt.current.travel;
    prev.current.wx = rt.current.windOffset[0];
    prev.current.wz = rt.current.windOffset[1];

    const g = group.current;
    if (!g) return;
    for (let i = 0; i < g.children.length; i++) {
      const m = g.children[i] as THREE.Mesh;
      let z = m.position.z + fwd + dwz;
      let x = m.position.x + dwx;
      if (z > 55) {
        z = -230 - rnd() * 60;
        x = (rnd() * 2 - 1) * 180;
        m.position.y = (rnd() * 2 - 1) * 65;
        const s = 130 + rnd() * 160;
        m.scale.set(s, s, 1);
      }
      m.position.x = x;
      m.position.z = z;
      m.quaternion.copy(camera.quaternion); // screen-aligned billboard
    }
    mat.color.setRGB(c.cloudLit[0], c.cloudLit[1], c.cloudLit[2], THREE.SRGBColorSpace);
    // Prominent while inside the deck (opening), a quiet drift afterwards.
    mat.opacity = clamp01(0.16 + rt.current.immersion * 0.5 + c.cloudOpacity * 0.12);
  });

  return (
    <group ref={group} renderOrder={6}>
      {planes.map((p, i) => (
        <mesh
          key={i}
          geometry={geo}
          material={mat}
          position={[p.x, p.y, p.z]}
          scale={[p.s, p.s, 1]}
        />
      ))}
    </group>
  );
}

export default function CloudField({ quality }: { quality: QualitySettings }) {
  const tex = useMemo(() => makePuffTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);

  const far: ZoneSpec = {
    count: Math.round(quality.cloudPuffs * 0.45),
    size: 200,
    halfX: 750,
    yMin: -110,
    yMax: 95,
    zBack: -780,
    zFront: -330,
    speedMul: 0.4,
    minVisible: 0.3,
    opacityScale: 0.85,
    renderOrder: 1,
  };
  const mid: ZoneSpec = {
    count: Math.round(quality.cloudPuffs * 0.4),
    size: 78,
    halfX: 430,
    yMin: -95,
    yMax: 75,
    zBack: -360,
    zFront: -85,
    speedMul: 0.85,
    minVisible: 0.05,
    opacityScale: 1,
    renderOrder: 2,
  };
  const vaporCount = quality.tier === "high" ? 10 : quality.tier === "balanced" ? 7 : 4;

  return (
    <>
      <CloudPoints spec={far} tex={tex} />
      <CloudPoints spec={mid} tex={tex} />
      <ForegroundVapor count={vaporCount} tex={tex} />
    </>
  );
}
