"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { activation } from "@/lib/data-experience/chapters";
import { useDataRuntime } from "../AtmosphericDataScene";

/**
 * The inner thermal body. Emissive (self-lit) so its colour reads as temperature
 * — cold blue → hot orange via `thermalColor` — and it expands with `thermalExpansion`.
 * A faint accent wireframe over it gives the "instrument" read. Both the warmth
 * pulse and a small extra swell are emphasised during the THERMAL chapter (2).
 */
const RADIUS = 1.0;

export default function ThermalSphere() {
  const rt = useDataRuntime();

  const detail = rt.current.dq.sphereDetail;
  const geo = useMemo(() => new THREE.IcosahedronGeometry(RADIUS, detail), [detail]);
  useEffect(() => () => geo.dispose(), [geo]);

  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const wire = useRef<THREE.LineBasicMaterial>(null);
  const group = useRef<THREE.Group>(null);

  useFrame(({ clock }, rawDelta) => {
    const c = rt.current.config;
    const reveal = rt.current.reveal;
    const reduced = rt.current.reducedMotion;
    const t = clock.elapsedTime;
    const thermalCh = activation(rt.current.scroll, 1);

    const breathe = 1 + Math.sin(t * 0.6) * 0.02 * (reduced ? 0.3 : 1);
    const swell = 1 + thermalCh * 0.06;
    const scale = c.thermalExpansion * breathe * swell * (0.2 + 0.8 * reveal);
    if (group.current) {
      group.current.scale.setScalar(scale);
      if (!reduced) group.current.rotation.y += rawDelta * 0.08;
    }

    const tc = c.thermalColor;
    if (mat.current) {
      mat.current.emissive.setRGB(tc[0], tc[1], tc[2], THREE.SRGBColorSpace);
      mat.current.emissiveIntensity = (0.35 + c.thermalIntensity * 0.7 + thermalCh * 0.4) * reveal;
      mat.current.opacity = reveal;
    }
    if (wire.current) {
      const a = c.accent;
      wire.current.color.setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace);
      wire.current.opacity = (0.12 + thermalCh * 0.22) * reveal;
    }
  });

  return (
    <group ref={group}>
      <mesh geometry={geo} renderOrder={1}>
        <meshStandardMaterial
          ref={mat}
          color={"#0a0c14"}
          roughness={0.45}
          metalness={0.15}
          transparent
        />
      </mesh>
      <lineSegments renderOrder={2} scale={1.02}>
        <wireframeGeometry args={[geo]} />
        <lineBasicMaterial ref={wire} transparent depthWrite={false} opacity={0} />
      </lineSegments>
    </group>
  );
}
