"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useSceneRuntime } from "./SceneDirector";

/**
 * Key light (sun by day, moon by night), ambient fill and a hemisphere light —
 * all colour/intensity/direction driven each frame by the interpolated config,
 * so dawn → noon → dusk → night happens as a smooth relight.
 */
export default function WeatherLighting() {
  const rt = useSceneRuntime();
  const key = useRef<THREE.DirectionalLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);

  useFrame(() => {
    const c = rt.current.config;
    if (key.current) {
      key.current.color.setRGB(c.lightColor[0], c.lightColor[1], c.lightColor[2]);
      key.current.intensity = c.lightIntensity;
      key.current.position.set(c.lightDir[0] * 140, c.lightDir[1] * 140, c.lightDir[2] * 140);
    }
    if (ambient.current) {
      ambient.current.color.setRGB(c.ambientColor[0], c.ambientColor[1], c.ambientColor[2]);
      ambient.current.intensity = c.ambientIntensity;
    }
    if (hemi.current) {
      hemi.current.color.setRGB(c.hemiSky[0], c.hemiSky[1], c.hemiSky[2]);
      hemi.current.groundColor.setRGB(c.hemiGround[0], c.hemiGround[1], c.hemiGround[2]);
      hemi.current.intensity = c.hemiIntensity;
    }
  });

  return (
    <>
      <directionalLight ref={key} />
      <ambientLight ref={ambient} />
      <hemisphereLight ref={hemi} />
    </>
  );
}
