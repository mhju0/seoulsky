"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import type { QualitySettings } from "@/components/three/quality";
import { computeSunPhase } from "@/lib/cinematic/seoulTime";
import type { LocationManifest } from "@/lib/cinematic/locationGallery";
import AtmosphericFieldFallback from "../AtmosphericFieldFallback";
import { useWeatherField } from "../WeatherFieldContext";
import FXOverlay, { type FxState } from "./FXOverlay";
import VideoGallery from "./VideoGallery";

/**
 * The one persistent SCENE that lives behind the /sky scroll content. It mounts
 * ONCE in the experience shell and never remounts on scroll. The view fills the
 * viewport edge-to-edge — there is no frame around it. Back-to-front:
 *
 *   1. Procedural atmospheric field (WebGL, or a CSS fallback) — the guaranteed
 *      never-blank base. It is always live until a video covers it, then it is
 *      paused (it sits fully behind the opaque clip), and it returns the moment a
 *      clip is unavailable. This is the tail of the fallback chain.
 *   2. The condition-coupled shuffling video gallery (the "view").
 *   3. The live weather FX overlay (rain/snow/lightning/fog/god-rays).
 *
 * Fallback chain (never a blank or frozen frame): matching clip → broadened clip
 * (both inside {@link VideoGallery}) → procedural field here. The video selection
 * + FX read the single live snapshot from {@link useWeatherField}; capability
 * flags (quality, reduced-motion, tab-hidden, WebGL) come from the shell.
 */

// WebGL field loads client-only (it touches the GL context on mount).
const AtmosphericFieldBackground = dynamic(() => import("../AtmosphericFieldBackground"), {
  ssr: false,
  loading: () => null,
});

/** Swap to the CSS field if the WebGL background throws at runtime. */
class FieldBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface SceneStageProps {
  quality: QualitySettings;
  reducedMotion: boolean;
  /** Tab hidden. */
  hidden: boolean;
  pointerEnabled: boolean;
  webgl: boolean;
  canvasFailed: boolean;
  onCanvasError: () => void;
}

export default function SceneStage({
  quality,
  reducedMotion,
  hidden,
  pointerEnabled,
  webgl,
  canvasFailed,
  onCanvasError,
}: SceneStageProps) {
  const { snapshot, readout, target, clock } = useWeatherField();

  const [manifest, setManifest] = useState<LocationManifest | null>(null);
  // True once a gallery clip is painting at full opacity — lets us pause the
  // procedural field behind it (and resume it the moment no clip covers).
  const [videoCovering, setVideoCovering] = useState(false);

  // Read the offline gallery manifest exactly once (a static public asset). On
  // failure the gallery never mounts and the procedural field stays the scene.
  useEffect(() => {
    let alive = true;
    fetch("/cinematic/manifest.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: LocationManifest) => {
        if (alive && Array.isArray(data?.clips)) setManifest(data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Time-of-day for clip selection, from Seoul sun geometry + the live snapshot.
  const isDay = useMemo(
    () =>
      computeSunPhase({
        now: clock ?? new Date(),
        sunrise: snapshot?.sun.sunrise,
        sunset: snapshot?.sun.sunset,
        isDayHint: snapshot?.current.isDay,
      }).isDay,
    [clock, snapshot],
  );

  // Live FX parameters, derived from the same clamped visual target as the field.
  const fx = useMemo<FxState>(
    () => ({
      rain: target.rainDistortion,
      snow: target.snowDensity,
      haze: target.hazeDensity,
      sunPos: target.sunPos,
      sunColor: target.sunColor,
      sunIntensity: target.sunIntensity,
      windDir: target.windDir,
      lightning: readout.condition === "thunderstorm",
    }),
    [target, readout.condition],
  );

  const useFallback = !webgl || canvasFailed;
  const galleryAvailable = !!manifest && manifest.clips.length >= 1;
  // The field idles whenever a clip fully covers it (or the tab is hidden).
  const fieldPaused = hidden || videoCovering;

  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#04060d]">
      {/* 1 — procedural field: the never-blank base + tail of the fallback chain. */}
      <div className="absolute inset-0">
        {useFallback ? (
          <AtmosphericFieldFallback config={target} reducedMotion={reducedMotion} />
        ) : (
          <FieldBoundary onError={onCanvasError}>
            <AtmosphericFieldBackground
              target={target}
              quality={quality}
              reducedMotion={reducedMotion}
              paused={fieldPaused}
              pointerEnabled={pointerEnabled}
            />
          </FieldBoundary>
        )}
      </div>

      {/* 2 — the shuffling Seoul-landmark video view. */}
      {galleryAvailable && (
        <VideoGallery
          manifest={manifest}
          condition={readout.condition}
          isDay={isDay}
          reducedMotion={reducedMotion}
          paused={hidden}
          onCoverageChange={setVideoCovering}
        />
      )}

      {/* 3 — live weather FX (off entirely under reduced motion). */}
      {!reducedMotion && <FXOverlay fx={fx} quality={quality} paused={hidden} />}
    </div>
  );
}
