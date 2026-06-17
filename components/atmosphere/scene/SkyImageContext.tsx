"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildImageGrade, type ImageGrade } from "@/lib/cinematic/skyPalette";
import {
  pickImageAnchor,
  selectSkyImage,
  type ImageAnchor,
  type SkyImageManifest,
} from "@/lib/cinematic/skyImageField";
import { useWeatherField } from "../WeatherFieldContext";

/**
 * The single source of truth for the still "atmospheric color field" plate.
 *
 * It reads the image manifest once, runs the pure {@link selectSkyImage} against
 * the live weather + sun-derived anchor, preloads the chosen plate, and only
 * promotes it to `src` once it actually decodes — so a 404 (a plate that hasn't
 * been generated yet) silently resolves to `null` and the consumers fall back to
 * the procedural CSS field. Both the sharp scene plate ({@link ImageField}) and
 * the defocused data-view backdrop read the SAME `src` here, so the D-toggle is a
 * depth transition across one cohesive image rather than two unrelated scenes.
 *
 * `grade` is the continuous time-of-day colour grade for whichever anchor is
 * showing; it is recomputed on the coarse field cadence (never per second).
 */
export interface SkyImageValue {
  /** The currently-decoded plate src, or `null` → show the procedural field. */
  src: string | null;
  /** Continuous sun-phase grade for the plate (ignored on the procedural fallback). */
  grade: ImageGrade;
  /** The anchor the live plate was chosen for (day | golden | night). */
  anchor: ImageAnchor;
}

const SkyImageContext = createContext<SkyImageValue | null>(null);

export function useSkyImage(): SkyImageValue {
  const v = useContext(SkyImageContext);
  if (!v) throw new Error("useSkyImage must be used inside <SkyImageProvider>");
  return v;
}

export function SkyImageProvider({ children }: { children: ReactNode }) {
  const { readout, isDay, dayFactor, goldenFactor, rising, elevation } = useWeatherField();

  const [manifest, setManifest] = useState<SkyImageManifest | null>(null);
  // The plate src that has actually decoded (so the scene never flashes a
  // half-loaded image, and a missing plate cleanly resolves to the field).
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  // Read the still-image manifest once (a static public asset). On failure the
  // provider serves `null` forever → the procedural CSS field stays the scene.
  useEffect(() => {
    let alive = true;
    fetch("/sky/manifest.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: SkyImageManifest) => {
        if (alive && Array.isArray(data?.images)) setManifest(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const anchor = pickImageAnchor(isDay, goldenFactor);
  const selectedSrc = useMemo(
    () => (manifest ? (selectSkyImage(manifest.images, readout.condition, anchor)?.src ?? null) : null),
    [manifest, readout.condition, anchor],
  );

  // Preload the selected plate; promote it only once decoded. While it loads we
  // keep showing the previous plate (no flash); a hard error (404 / not yet
  // generated) clears to `null` so the field — already condition-tinted — shows.
  useEffect(() => {
    if (!selectedSrc) {
      setLoadedSrc(null);
      return;
    }
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (alive) setLoadedSrc(selectedSrc);
    };
    img.onerror = () => {
      if (alive) setLoadedSrc(null);
    };
    img.src = selectedSrc;
    return () => {
      alive = false;
    };
  }, [selectedSrc]);

  const grade = useMemo(
    () => buildImageGrade(dayFactor, goldenFactor, rising, elevation, readout.condition),
    [dayFactor, goldenFactor, rising, elevation, readout.condition],
  );

  const value = useMemo<SkyImageValue>(
    () => ({ src: loadedSrc, grade, anchor }),
    [loadedSrc, grade, anchor],
  );

  return <SkyImageContext.Provider value={value}>{children}</SkyImageContext.Provider>;
}
