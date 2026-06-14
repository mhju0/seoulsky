"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useSceneRuntime } from "./SceneDirector";
import { makeDotTexture } from "./textures";
import type { QualitySettings } from "./quality";

/**
 * True 3D precipitation in camera space. Both systems live in a box that snaps
 * to the camera each frame, so the viewer is always inside the weather; fall
 * direction tilts with the live wind. Counts scale with precipitation intensity
 * from the config (and are calmed under reduced-motion).
 */

const BOX = 75;
const rnd = () => Math.random();

function Rain({ quality }: { quality: QualitySettings }) {
  const rt = useSceneRuntime();
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.LineBasicMaterial>(null);

  const max = quality.rainCount;
  const { geo, heads } = useMemo(() => {
    const heads = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) {
      heads[i * 3] = (rnd() * 2 - 1) * BOX;
      heads[i * 3 + 1] = (rnd() * 2 - 1) * BOX;
      heads[i * 3 + 2] = (rnd() * 2 - 1) * BOX;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 2 * 3), 3));
    return { geo: g, heads };
  }, [max]);
  useEffect(() => () => geo.dispose(), [geo]);

  const dir = useMemo(() => new THREE.Vector3(), []);
  const ndir = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDelta) => {
    const c = rt.current.config;
    const intensity = c.rain;
    if (group.current) group.current.visible = intensity > 0.02;
    if (intensity <= 0.02) return;
    const dt = Math.min(rawDelta, 0.05);
    const reduced = rt.current.reducedMotion;

    const fall = reduced ? 36 : 78;
    const wind = c.windStrength * (reduced ? 10 : 26);
    dir.set(c.windVec[0] * wind, -fall, c.windVec[1] * wind);
    const len = 7 + intensity * 7;
    ndir.copy(dir).normalize().multiplyScalar(len);
    const active = Math.round(max * intensity);

    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < active; i++) {
      let x = heads[i * 3] + dir.x * dt;
      let y = heads[i * 3 + 1] + dir.y * dt;
      let z = heads[i * 3 + 2] + dir.z * dt;
      if (y < -BOX) {
        y = BOX;
        x = (rnd() * 2 - 1) * BOX;
        z = (rnd() * 2 - 1) * BOX;
      }
      heads[i * 3] = x;
      heads[i * 3 + 1] = y;
      heads[i * 3 + 2] = z;
      arr[i * 6] = x;
      arr[i * 6 + 1] = y;
      arr[i * 6 + 2] = z;
      arr[i * 6 + 3] = x - ndir.x;
      arr[i * 6 + 4] = y - ndir.y;
      arr[i * 6 + 5] = z - ndir.z;
    }
    pos.needsUpdate = true;
    geo.setDrawRange(0, active * 2);
    if (group.current) group.current.position.copy(camera.position);
    if (matRef.current) matRef.current.opacity = Math.min(0.6, 0.2 + intensity * 0.5);
  });

  return (
    <group ref={group}>
      <lineSegments geometry={geo} frustumCulled={false} renderOrder={8}>
        <lineBasicMaterial ref={matRef} color={"#aebfe0"} transparent opacity={0} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

function Snow({ quality, tex }: { quality: QualitySettings; tex: THREE.Texture }) {
  const rt = useSceneRuntime();
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);

  const max = quality.snowCount;
  const { geo, phase } = useMemo(() => {
    const pos = new Float32Array(max * 3);
    const phase = new Float32Array(max);
    for (let i = 0; i < max; i++) {
      pos[i * 3] = (rnd() * 2 - 1) * BOX;
      pos[i * 3 + 1] = (rnd() * 2 - 1) * BOX;
      pos[i * 3 + 2] = (rnd() * 2 - 1) * BOX;
      phase[i] = rnd() * Math.PI * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return { geo: g, phase };
  }, [max]);
  useEffect(() => () => geo.dispose(), [geo]);

  useFrame(({ clock }, rawDelta) => {
    const c = rt.current.config;
    const intensity = c.snow;
    if (group.current) group.current.visible = intensity > 0.02;
    if (intensity <= 0.02) return;
    const dt = Math.min(rawDelta, 0.05);
    const reduced = rt.current.reducedMotion;
    const fall = reduced ? 3.5 : 6.5;
    const wind = c.windStrength * (reduced ? 5 : 12);
    const t = clock.elapsedTime;

    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const active = Math.round(max * intensity);
    for (let i = 0; i < active; i++) {
      let y = arr[i * 3 + 1] - fall * dt;
      let x = arr[i * 3] + (Math.sin(t * 0.7 + phase[i]) * 2.2 + c.windVec[0] * wind) * dt;
      let z = arr[i * 3 + 2] + (Math.cos(t * 0.5 + phase[i]) * 1.6 + c.windVec[1] * wind) * dt;
      if (y < -BOX) {
        y = BOX;
        x = (rnd() * 2 - 1) * BOX;
        z = (rnd() * 2 - 1) * BOX;
      }
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    pos.needsUpdate = true;
    geo.setDrawRange(0, active);
    if (group.current) group.current.position.copy(camera.position);
    if (matRef.current) matRef.current.opacity = Math.min(0.9, 0.4 + intensity * 0.5);
  });

  return (
    <group ref={group}>
      <points geometry={geo} frustumCulled={false} renderOrder={8}>
        <pointsMaterial
          ref={matRef}
          map={tex}
          color={"#eef2fb"}
          size={1.5}
          sizeAttenuation
          transparent
          opacity={0}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

export default function WeatherParticles({ quality }: { quality: QualitySettings }) {
  const tex = useMemo(() => makeDotTexture(), []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <>
      <Rain quality={quality} />
      <Snow quality={quality} tex={tex} />
    </>
  );
}
