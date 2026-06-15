"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { activation } from "@/lib/data-experience/chapters";
import { useDataRuntime } from "../AtmosphericDataScene";
import { createFresnelGlassMaterial } from "../materials/fresnelGlass";

/**
 * The translucent observation dome. A Fresnel rim makes it read as glass that
 * thickens with humidity (`shellOpacity`). During the OVERVIEW chapter a scan
 * line sweeps vertically across it (the "assembling instrument" beat); during
 * SUSPENDED WATER it swells and condenses slightly. The shell radius is in local
 * geometry units, which is what the scan uniform is expressed in.
 */
const RADIUS = 2.3;

export default function GlassShell() {
  const rt = useDataRuntime();

  const detail = Math.max(3, rt.current.dq.sphereDetail);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(RADIUS, detail), [detail]);
  const material = useMemo(() => createFresnelGlassMaterial(), []);
  useEffect(
    () => () => {
      geo.dispose();
      material.dispose();
    },
    [geo, material],
  );

  const mesh = useRef<THREE.Mesh>(null);

  useFrame(({ clock }, rawDelta) => {
    const c = rt.current.config;
    const reveal = rt.current.reveal;
    const reduced = rt.current.reducedMotion;
    const t = clock.elapsedTime;
    const u = material.uniforms;

    u.uColor.value.setRGB(c.shellTint[0], c.shellTint[1], c.shellTint[2], THREE.SRGBColorSpace);
    u.uAccent.value.setRGB(c.accent[0], c.accent[1], c.accent[2], THREE.SRGBColorSpace);
    u.uOpacity.value = c.shellOpacity;
    u.uReveal.value = reveal;

    // Scan sweep: strong during assembly (overview), a faint idle pulse after.
    const overview = activation(rt.current.scroll, 0);
    const sweep = ((t * (reduced ? 0.15 : 0.32)) % 1) * 2 - 1; // -1..1
    u.uScan.value = sweep * RADIUS;
    u.uScanAmp.value = Math.max(overview * (0.6 + 0.4 * (1 - reveal)), 0.08);

    if (mesh.current) {
      const water = activation(rt.current.scroll, 3);
      const swell = 1 + c.condensation * 0.05 * water + Math.sin(t * 0.5) * 0.004;
      mesh.current.scale.setScalar(swell);
      if (!reduced) mesh.current.rotation.y -= rawDelta * 0.03;
    }
  });

  return <mesh ref={mesh} geometry={geo} material={material} renderOrder={10} />;
}
