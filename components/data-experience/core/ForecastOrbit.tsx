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
 * TIME ORBIT chapter (5): the next 12 hours as a luminous orbital system around
 * the core. Each hour is a billboard sized by its temperature and coloured
 * cold→warm; precipitation hours read cooler/bluer; the current hour pulses in
 * the accent. The whole orbit eases in and rotates as the chapter scrolls in.
 */
const COLD: RGB = [0.4, 0.62, 1.0];
const HOT: RGB = [1.0, 0.5, 0.24];
const PRECIP_TINT: RGB = [0.5, 0.72, 1.0];
const ORBIT_R = 3.65;
const HOURS = 12;

const ch = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);
const hex = (c: RGB) => `#${[c[0], c[1], c[2]].map((v) => ch(v).toString(16).padStart(2, "0")).join("")}`;

export default function ForecastOrbit({ hourly }: { hourly: HourlyForecast[] }) {
  const rt = useDataRuntime();
  const dot = useMemo(() => makeDotTexture(), []);
  useEffect(() => () => dot.dispose(), [dot]);

  const markers = useMemo(() => {
    const pts = buildHourPoints(hourly, HOURS);
    const n = pts.length;
    return pts.map((p, i) => {
      const a = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
      let col: RGB = [
        COLD[0] + (HOT[0] - COLD[0]) * p.tempAbs,
        COLD[1] + (HOT[1] - COLD[1]) * p.tempAbs,
        COLD[2] + (HOT[2] - COLD[2]) * p.tempAbs,
      ];
      if (p.isPrecip) col = [col[0] * 0.5 + PRECIP_TINT[0] * 0.5, col[1] * 0.5 + PRECIP_TINT[1] * 0.5, col[2] * 0.5 + PRECIP_TINT[2] * 0.5];
      return {
        x: Math.cos(a) * ORBIT_R,
        z: Math.sin(a) * ORBIT_R,
        color: hex(col),
        size: 0.16 + p.tempRel * 0.12 + (p.isNow ? 0.16 : 0),
        isNow: p.isNow,
      };
    });
  }, [hourly]);

  const group = useRef<THREE.Group>(null);
  const mats = useRef<(THREE.SpriteMaterial | null)[]>([]);

  useFrame(({ clock }) => {
    const reveal = rt.current.reveal;
    const reduced = rt.current.reducedMotion;
    const on = activation(rt.current.scroll, 4) * reveal;

    if (group.current) {
      group.current.visible = markers.length > 0 && on > 0.01;
      group.current.rotation.x = -0.62;
      // Idle drift + a push from scrolling through the final chapter.
      const scrub = rt.current.chapter === 4 ? rt.current.chapterLocal : rt.current.scroll;
      group.current.rotation.y = scrub * Math.PI * 0.5 + (reduced ? 0 : clock.elapsedTime * 0.03);
    }
    const pulse = 0.8 + Math.sin(clock.elapsedTime * 2) * 0.2;
    for (let i = 0; i < mats.current.length; i++) {
      const m = mats.current[i];
      if (!m) continue;
      m.opacity = on * (markers[i]?.isNow ? pulse : 0.85);
    }
  });

  return (
    <group ref={group}>
      {markers.map((mk, i) => (
        <sprite key={i} position={[mk.x, 0, mk.z]} scale={[mk.size, mk.size, 1]} renderOrder={8}>
          <spriteMaterial
            ref={(m) => {
              mats.current[i] = m;
            }}
            map={dot}
            color={mk.color}
            transparent
            depthWrite={false}
            toneMapped={false}
            opacity={0}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      ))}
    </group>
  );
}
