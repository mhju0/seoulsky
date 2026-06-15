"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { activation } from "@/lib/data-experience/chapters";
import { makeDotTexture } from "@/components/three/textures";
import { useDataRuntime } from "../AtmosphericDataScene";

/**
 * Rain streaks (line segments) or snow flakes (points) falling through the
 * volume around the core, tilted by the live wind. The active count scales with
 * `precipDensity`; `precipType` switches which system is drawn (the other hides).
 * When the sky is dry both hide cleanly — never a broken or empty-looking scene.
 */
const R = 2.5; // horizontal radius of the fall cylinder
const H = 2.8; // half height
const rnd = () => Math.random();

export default function PrecipitationField() {
  const rt = useDataRuntime();
  const max = rt.current.dq.precip;

  const tex = useMemo(() => makeDotTexture(), []);

  // Rain — line segments (head → short tail along the fall direction).
  const rain = useMemo(() => {
    const heads = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * R;
      heads[i * 3] = Math.cos(a) * r;
      heads[i * 3 + 1] = (rnd() * 2 - 1) * H;
      heads[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 2 * 3), 3));
    return { geo: g, heads };
  }, [max]);

  // Snow — points with a gentle sway phase.
  const snow = useMemo(() => {
    const pos = new Float32Array(max * 3);
    const phase = new Float32Array(max);
    for (let i = 0; i < max; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * R;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = (rnd() * 2 - 1) * H;
      pos[i * 3 + 2] = Math.sin(a) * r;
      phase[i] = rnd() * Math.PI * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return { geo: g, phase };
  }, [max]);

  useEffect(
    () => () => {
      tex.dispose();
      rain.geo.dispose();
      snow.geo.dispose();
    },
    [tex, rain, snow],
  );

  const rainGroup = useRef<THREE.Group>(null);
  const rainMat = useRef<THREE.LineBasicMaterial>(null);
  const snowGroup = useRef<THREE.Group>(null);
  const snowMat = useRef<THREE.PointsMaterial>(null);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const ndir = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDelta) => {
    const c = rt.current.config;
    const reveal = rt.current.reveal;
    const reduced = rt.current.reducedMotion;
    const dt = Math.min(rawDelta, 0.05);
    const water = activation(rt.current.scroll, 3);
    const intensity = c.precipDensity * Math.max(0.35, water) * reveal;

    const showRain = c.precipType === "rain" && intensity > 0.02;
    const showSnow = c.precipType === "snow" && intensity > 0.02;
    if (rainGroup.current) rainGroup.current.visible = showRain;
    if (snowGroup.current) snowGroup.current.visible = showSnow;

    if (showRain) {
      const fall = reduced ? 4 : 9;
      const wind = c.windSpeedNorm * (reduced ? 1.2 : 2.6);
      dir.set(c.windVec[0] * wind, -fall, c.windVec[1] * wind);
      const len = 0.3 + intensity * 0.4;
      ndir.copy(dir).normalize().multiplyScalar(len);
      const active = Math.round(max * Math.min(1, intensity));
      const pos = rain.geo.getAttribute("position") as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const h = rain.heads;
      for (let i = 0; i < active; i++) {
        let x = h[i * 3] + dir.x * dt;
        let y = h[i * 3 + 1] + dir.y * dt;
        let z = h[i * 3 + 2] + dir.z * dt;
        if (y < -H) {
          y = H;
          const a = rnd() * Math.PI * 2;
          const r = Math.sqrt(rnd()) * R;
          x = Math.cos(a) * r;
          z = Math.sin(a) * r;
        }
        h[i * 3] = x;
        h[i * 3 + 1] = y;
        h[i * 3 + 2] = z;
        arr[i * 6] = x;
        arr[i * 6 + 1] = y;
        arr[i * 6 + 2] = z;
        arr[i * 6 + 3] = x - ndir.x;
        arr[i * 6 + 4] = y - ndir.y;
        arr[i * 6 + 5] = z - ndir.z;
      }
      pos.needsUpdate = true;
      rain.geo.setDrawRange(0, active * 2);
      if (rainMat.current) {
        const a = c.accent;
        rainMat.current.color.setRGB(a[0] * 0.6 + 0.4, a[1] * 0.6 + 0.45, a[2] * 0.6 + 0.5, THREE.SRGBColorSpace);
        rainMat.current.opacity = Math.min(0.7, 0.25 + intensity * 0.5);
      }
    }

    if (showSnow) {
      const fall = reduced ? 0.5 : 1.0;
      const wind = c.windSpeedNorm * (reduced ? 0.4 : 0.9);
      const t = performance.now() / 1000;
      const active = Math.round(max * Math.min(1, intensity));
      const pos = snow.geo.getAttribute("position") as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < active; i++) {
        let y = arr[i * 3 + 1] - fall * dt;
        let x = arr[i * 3] + (Math.sin(t * 0.8 + snow.phase[i]) * 0.25 + c.windVec[0] * wind) * dt;
        let z = arr[i * 3 + 2] + (Math.cos(t * 0.6 + snow.phase[i]) * 0.2 + c.windVec[1] * wind) * dt;
        if (y < -H) {
          y = H;
          const a = rnd() * Math.PI * 2;
          const r = Math.sqrt(rnd()) * R;
          x = Math.cos(a) * r;
          z = Math.sin(a) * r;
        }
        arr[i * 3] = x;
        arr[i * 3 + 1] = y;
        arr[i * 3 + 2] = z;
      }
      pos.needsUpdate = true;
      snow.geo.setDrawRange(0, active);
      if (snowMat.current) snowMat.current.opacity = Math.min(0.9, 0.4 + intensity * 0.5);
    }
  });

  return (
    <>
      <group ref={rainGroup}>
        <lineSegments geometry={rain.geo} frustumCulled={false} renderOrder={7}>
          <lineBasicMaterial ref={rainMat} transparent opacity={0} depthWrite={false} />
        </lineSegments>
      </group>
      <group ref={snowGroup}>
        <points geometry={snow.geo} frustumCulled={false} renderOrder={7}>
          <pointsMaterial
            ref={snowMat}
            map={tex}
            color={"#eef3fb"}
            size={0.07}
            sizeAttenuation
            transparent
            opacity={0}
            depthWrite={false}
          />
        </points>
      </group>
    </>
  );
}
