"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mulberry32 } from "@/lib/random";
import { activation } from "@/lib/data-experience/chapters";
import { makeDotTexture } from "@/components/three/textures";
import { useDataRuntime } from "../AtmosphericDataScene";

/**
 * The scientific-instrument framing: three gyroscopic accent rings around the
 * core, plus a flat compass ring of tick marks in the ground plane with a marker
 * that points to the wind's origin. The compass + marker brighten and the marker
 * tracks `windDirDeg` during the AIR MOVEMENT chapter (3).
 */
const TICKS = 48;
const COMPASS_R = 3.15;

export default function TechnicalRings() {
  const rt = useDataRuntime();

  const dot = useMemo(() => makeDotTexture(), []);
  const tickGeo = useMemo(() => {
    const rand = mulberry32(404);
    const pos = new Float32Array(TICKS * 3);
    for (let i = 0; i < TICKS; i++) {
      const a = (i / TICKS) * Math.PI * 2;
      const r = COMPASS_R + (rand() - 0.5) * 0.01;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useEffect(
    () => () => {
      dot.dispose();
      tickGeo.dispose();
    },
    [dot, tickGeo],
  );

  const gyro = useRef<THREE.Group>(null);
  const ringMats = useRef<THREE.MeshBasicMaterial[]>([]);
  const compass = useRef<THREE.Group>(null);
  const compassRingMat = useRef<THREE.MeshBasicMaterial>(null);
  const tickMat = useRef<THREE.PointsMaterial>(null);
  const marker = useRef<THREE.Mesh>(null);
  const markerMat = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((_, rawDelta) => {
    const c = rt.current.config;
    const reveal = rt.current.reveal;
    const reduced = rt.current.reducedMotion;
    const a = c.accent;
    const windCh = activation(rt.current.scroll, 2);
    const spin = reduced ? 0.04 : 0.12;

    if (gyro.current) {
      gyro.current.rotation.y += rawDelta * spin;
      gyro.current.rotation.x += rawDelta * spin * 0.4;
    }
    for (const m of ringMats.current) {
      if (!m) continue;
      m.color.setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace);
      m.opacity = (0.14 + windCh * 0.08) * reveal;
    }

    if (compassRingMat.current) {
      compassRingMat.current.color.setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace);
      compassRingMat.current.opacity = (0.08 + windCh * 0.22) * reveal;
    }
    if (tickMat.current) {
      tickMat.current.color.setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace);
      tickMat.current.opacity = (0.18 + windCh * 0.4) * reveal;
    }
    // Marker points toward where the wind comes FROM (compass bearing, +Z = north).
    if (marker.current && markerMat.current) {
      const rad = (c.windDirDeg * Math.PI) / 180;
      marker.current.position.set(Math.sin(rad) * COMPASS_R, 0, Math.cos(rad) * COMPASS_R);
      marker.current.lookAt(0, 0, 0);
      markerMat.current.color.setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace);
      markerMat.current.opacity = windCh * (0.5 + c.windSpeedNorm * 0.5) * reveal;
      const s = 0.6 + c.windSpeedNorm * 0.6;
      marker.current.scale.set(s, s, s);
    }
  });

  const ringConf: [number, [number, number, number]][] = [
    [2.62, [Math.PI / 2.2, 0, 0.3]],
    [2.78, [0.4, Math.PI / 3, 0]],
    [2.94, [Math.PI / 2.6, Math.PI / 2.4, 0]],
  ];

  return (
    <group>
      <group ref={gyro}>
        {ringConf.map(([r, rot], i) => (
          <mesh key={i} rotation={rot} renderOrder={3}>
            <torusGeometry args={[r, 0.008, 8, 140]} />
            <meshBasicMaterial
              ref={(m) => {
                if (m) ringMats.current[i] = m;
              }}
              transparent
              depthWrite={false}
              opacity={0}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}
      </group>

      <group ref={compass}>
        <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={3}>
          <torusGeometry args={[COMPASS_R, 0.006, 6, 180]} />
          <meshBasicMaterial
            ref={compassRingMat}
            transparent
            depthWrite={false}
            opacity={0}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <points geometry={tickGeo} renderOrder={4}>
          <pointsMaterial
            ref={tickMat}
            map={dot}
            size={0.07}
            sizeAttenuation
            transparent
            depthWrite={false}
            opacity={0}
            blending={THREE.AdditiveBlending}
          />
        </points>
        <mesh ref={marker} renderOrder={5}>
          <coneGeometry args={[0.08, 0.26, 12]} />
          <meshBasicMaterial
            ref={markerMat}
            transparent
            depthWrite={false}
            opacity={0}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      </group>
    </group>
  );
}
