"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mulberry32 } from "@/lib/random";
import { useSceneRuntime } from "./SceneDirector";
import { makeDotTexture } from "./textures";
import type { QualitySettings } from "./quality";

/**
 * Seoul, far below and far ahead. Procedural building clusters (no visible
 * repeated boxes — varied height/width/position), a faint Han River band, and
 * silhouettes of N Seoul Tower on a ridge + a tapering Lotte-style spire. At
 * night, warm window lights fade in; scene fog naturally dissolves the whole
 * city into the atmosphere as visibility drops (fog/rain hide it entirely).
 */

const CITY = { x: 0, y: -155, z: -745 };

export default function SeoulHorizon({ quality }: { quality: QualitySettings }) {
  const rt = useSceneRuntime();
  const buildingsRef = useRef<THREE.InstancedMesh>(null);
  const cityMat = useMemo(() => new THREE.MeshBasicMaterial({ fog: true }), []);
  const riverMat = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, fog: true }),
    [],
  );
  const dot = useMemo(() => makeDotTexture(), []);
  const lightsMat = useRef<THREE.PointsMaterial>(null);

  const boxGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  useEffect(
    () => () => {
      cityMat.dispose();
      riverMat.dispose();
      boxGeo.dispose();
      dot.dispose();
    },
    [cityMat, riverMat, boxGeo, dot],
  );

  const count = quality.buildings;
  // Stable args identity so R3F never reconstructs the InstancedMesh (which
  // would drop the matrices we set in the effect below).
  const args = useMemo(
    () => [boxGeo, cityMat, count] as [THREE.BufferGeometry, THREE.Material, number],
    [boxGeo, cityMat, count],
  );

  // Place the procedural skyline once.
  useEffect(() => {
    const mesh = buildingsRef.current;
    if (!mesh) return;
    const rand = mulberry32(5665);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const w = 5 + rand() * 14;
      const d = 5 + rand() * 14;
      const h = 6 + rand() * rand() * 78; // mostly low, a few towers
      dummy.position.set((rand() * 2 - 1) * 900, h / 2, (rand() * 2 - 1) * 130);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [count]);

  // Night lights scattered through the city volume.
  const lightsGeo = useMemo(() => {
    const rand = mulberry32(127);
    const n = Math.round(count * 3);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rand() * 2 - 1) * 880;
      pos[i * 3 + 1] = rand() * 62;
      pos[i * 3 + 2] = (rand() * 2 - 1) * 125;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [count]);
  useEffect(() => () => lightsGeo.dispose(), [lightsGeo]);

  const tmp = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const c = rt.current.config;
    // Buildings read as silhouettes — a touch darker than the fog they sit in.
    tmp.setRGB(c.fogColor[0] * 0.5, c.fogColor[1] * 0.5, c.fogColor[2] * 0.55, THREE.SRGBColorSpace);
    cityMat.color.copy(tmp);
    riverMat.color.setRGB(c.skyHorizon[0] * 0.7, c.skyHorizon[1] * 0.72, c.skyHorizon[2] * 0.85, THREE.SRGBColorSpace);
    riverMat.opacity = 0.28 * c.cityVisibility;

    if (lightsMat.current) {
      lightsMat.current.color.setRGB(c.cityGlow[0], c.cityGlow[1], c.cityGlow[2], THREE.SRGBColorSpace);
      lightsMat.current.opacity = c.cityLight * c.cityVisibility;
      lightsMat.current.visible = c.cityLight * c.cityVisibility > 0.02;
    }
  });

  return (
    <group position={[CITY.x, CITY.y, CITY.z]}>
      <instancedMesh ref={buildingsRef} args={args} frustumCulled={false} renderOrder={0} />

      {/* Han River — a faint band threading the city. */}
      <mesh material={riverMat} position={[40, 1, 60]} rotation={[-Math.PI / 2, 0, 0.12]}>
        <planeGeometry args={[1500, 70]} />
      </mesh>

      {/* N Seoul Tower on a ridge (left). */}
      <group position={[-320, 0, -30]}>
        <mesh material={cityMat} position={[0, 26, 0]}>
          <coneGeometry args={[120, 56, 24]} />
        </mesh>
        <mesh material={cityMat} position={[0, 96, 0]}>
          <cylinderGeometry args={[3.5, 6, 86, 12]} />
        </mesh>
        <mesh material={cityMat} position={[0, 132, 0]}>
          <cylinderGeometry args={[11, 11, 16, 12]} />
        </mesh>
        <mesh material={cityMat} position={[0, 150, 0]}>
          <cylinderGeometry args={[1.5, 2.5, 24, 8]} />
        </mesh>
      </group>

      {/* Lotte-style tapering spire (right). */}
      <mesh material={cityMat} position={[300, 82, 20]}>
        <cylinderGeometry args={[5, 26, 164, 6]} />
      </mesh>

      <points geometry={lightsGeo} renderOrder={0} frustumCulled={false}>
        <pointsMaterial
          ref={lightsMat}
          map={dot}
          size={6}
          sizeAttenuation
          transparent
          opacity={0}
          depthWrite={false}
        />
      </points>
    </group>
  );
}
