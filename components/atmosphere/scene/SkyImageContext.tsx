"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildImageGrade, type ImageGrade } from "@/lib/cinematic/skyPalette";
import {
  normalizeSrcs,
  pickImageAnchor,
  pickVariantIndex,
  selectSkyImage,
  type ImageAnchor,
  type SkyImageManifest,
} from "@/lib/cinematic/skyImageField";
import { getSeoulParts } from "@/lib/cinematic/seoulTime";
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

  // Computed once at manifest-load time; 0 is a safe "not yet set" sentinel
  // since real Seoul dates yield values ≥ 20000101.
  const daySeedRef = useRef(0);

  // Read the still-image manifest once (a static public asset). On failure the
  // provider serves `null` forever → the procedural CSS field stays the scene.
  useEffect(() => {
    let alive = true;
    fetch("/sky/manifest.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: SkyImageManifest) => {
        if (alive && Array.isArray(data?.images)) {
          // Compute the Seoul calendar date once, locked in for this mount so the
          // chosen variant is stable for the whole session (no mid-session swaps).
          if (daySeedRef.current === 0) {
            const { year, month, day } = getSeoulParts(new Date());
            daySeedRef.current = year * 10000 + month * 100 + day;
          }
          setManifest(data);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const anchor = pickImageAnchor(isDay, goldenFactor);

  // Ordered candidate list: chosen variant first (for today's slot), then the
  // remaining variants as fallbacks in case the chosen one 404s.
  const selectedSrcs = useMemo((): readonly string[] => {
    if (!manifest) return [];
    const slot = selectSkyImage(manifest.images, readout.condition, anchor);
    if (!slot) return [];
    const all = normalizeSrcs(slot.srcs);
    if (all.length <= 1) return all;
    const idx = pickVariantIndex(all.length, daySeedRef.current, `${slot.landmark}:${slot.condition}:${slot.anchor}`);
    return [all[idx], ...all.filter((_, i) => i !== idx)];
  }, [manifest, readout.condition, anchor]);

  // Preload the chosen variant; on error try the next candidate in the array
  // before falling back to null (procedural field). While loading we keep the
  // previous plate visible — no flash.
  useEffect(() => {
    if (selectedSrcs.length === 0) {
      setLoadedSrc(null);
      return;
    }
    let alive = true;
    let idx = 0;

    function tryNext() {
      if (!alive) return;
      if (idx >= selectedSrcs.length) {
        setLoadedSrc(null);
        return;
      }
      const src = selectedSrcs[idx++];
      const img = new Image();
      img.onload = () => {
        if (alive) setLoadedSrc(src);
      };
      img.onerror = () => {
        if (alive) tryNext();
      };
      img.src = src;
    }

    tryNext();
    return () => {
      alive = false;
    };
  }, [selectedSrcs]);

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
