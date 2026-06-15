"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildHourPoints, type RGB } from "@/lib/data-experience/atmosphericConfig";
import { activation } from "@/lib/data-experience/chapters";
import { makeDotTexture } from "@/components/three/textures";
import type { HourlyForecast } from "@/lib/types";
import { useDataRuntime } from "../AtmosphericDataScene";

/**
 * THERMAL chapter (2): the hourly temperature trend as a closed orbital ribbon
 * around the core instead of a rectangular line chart. Each hour sits on a tilted
 * ring; warmer hours push the ribbon outward, colder hours pull it in, and the
 * node colour runs cold-blue → hot-orange across the absolute Seoul envelope. The
 * current hour is marked with a pulsing accent node. Fades in during chapter 2.
 *
 * Geometry rebuilds only when the hourly data changes (every ~12 min), never per
 * frame; the frame loop only animates rotation and opacity.
 */
const COLD: RGB = [0.35, 0.6, 1.0];
const HOT: RGB = [1.0, 0.46, 0.2];
const R_BASE = 2.55;
const SPREAD = 1.25;

export default function TemperatureRibbon({ hourly }: { hourly: HourlyForecast[] }) {
  const rt = useDataRuntime();
  const dot = useMemo(() => makeDotTexture(), []);

  const orbitPoints = rt.current.dq.orbitPoints;
  const { geo, nowPos, hasData } = useMemo(() => {
    const pts = buildHourPoints(hourly, orbitPoints);
    const n = pts.length;
    const g = new THREE.BufferGeometry();
    const nowPos = new THREE.Vector3();
    if (n === 0) {
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
      g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(0), 3));
      return { geo: g, nowPos, hasData: false };
    }
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = (i / n) * Math.PI * 2;
      const r = R_BASE + p.tempRel * SPREAD;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      pos[i * 3] = x;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = z;
      col[i * 3] = COLD[0] + (HOT[0] - COLD[0]) * p.tempAbs;
      col[i * 3 + 1] = COLD[1] + (HOT[1] - COLD[1]) * p.tempAbs;
      col[i * 3 + 2] = COLD[2] + (HOT[2] - COLD[2]) * p.tempAbs;
      if (p.isNow) nowPos.set(x, 0, z);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return { geo: g, nowPos, hasData: true };
  }, [hourly, orbitPoints]);

  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => dot.dispose(), [dot]);

  const group = useRef<THREE.Group>(null);
  const lineMat = useRef<THREE.LineBasicMaterial>(null);
  const nodeMat = useRef<THREE.PointsMaterial>(null);
  const now = useRef<THREE.Sprite>(null);

  useFrame(({ clock }, rawDelta) => {
    const c = rt.current.config;
    const reveal = rt.current.reveal;
    const reduced = rt.current.reducedMotion;
    const on = activation(rt.current.scroll, 1) * reveal;

    if (group.current) {
      group.current.visible = hasData && on > 0.01;
      if (!reduced) group.current.rotation.y += rawDelta * 0.06;
      group.current.rotation.x = -0.52; // fixed tilt so it reads as a ring, not a flat disc
    }
    if (lineMat.current) lineMat.current.opacity = on * 0.7;
    if (nodeMat.current) nodeMat.current.opacity = on;
    if (now.current) {
      now.current.position.copy(nowPos);
      const pulse = 0.85 + Math.sin(clock.elapsedTime * 2.2) * 0.15;
      const s = 0.34 * pulse;
      now.current.scale.set(s, s, 1);
      const a = c.accent;
      const m = now.current.material as THREE.SpriteMaterial;
      m.color.setRGB(a[0], a[1], a[2], THREE.SRGBColorSpace);
      m.opacity = on;
    }
  });

  return (
    <group ref={group}>
      <lineLoop geometry={geo}>
        <lineBasicMaterial ref={lineMat} vertexColors transparent depthWrite={false} opacity={0} />
      </lineLoop>
      <points geometry={geo}>
        <pointsMaterial
          ref={nodeMat}
          map={dot}
          size={0.14}
          sizeAttenuation
          vertexColors
          transparent
          depthWrite={false}
          opacity={0}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <sprite ref={now} renderOrder={8}>
        <spriteMaterial map={dot} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  );
}
