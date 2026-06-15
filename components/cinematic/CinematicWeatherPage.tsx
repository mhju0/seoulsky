"use client";

import { AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveSeoulWeather } from "@/hooks/useLiveSeoulWeather";
import { useWeatherViewShortcuts } from "@/hooks/useWeatherViewShortcuts";
import {
  detectQuality,
  hasWebGL,
  prefersReducedMotion,
  type QualitySettings,
} from "@/components/three/quality";
import {
  CINEMATIC_PLATE_KEYS,
  isPlateGenerated,
  type CinematicPlateKey,
} from "@/lib/cinematic/plateManifest";
import { selectPlateFromSky, type PlateSelection } from "@/lib/cinematic/selectPlate";
import { writeCinematicStatus, type CinematicRenderMode } from "@/lib/cinematic/cinematicStatus";
import CinematicGrade from "./CinematicGrade";
import CinematicLoader from "./CinematicLoader";
import CinematicPlate from "./CinematicPlate";
import MinimalWeatherOverlay from "./MinimalWeatherOverlay";
import WebGLFallback from "./WebGLFallback";

// three.js + the whole scene load client-side only.
const SeoulSkyCanvas = dynamic(() => import("@/components/three/SeoulSkyCanvas"), {
  ssr: false,
  loading: () => null,
});

/** Swap to the 2D fallback if the WebGL scene throws at runtime. */
class CanvasBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
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

/** Master switch — plates are on unless explicitly disabled. */
const PLATES_ENABLED = process.env.NEXT_PUBLIC_CINEMATIC_PLATES !== "0";
const IS_DEV = process.env.NODE_ENV !== "production";

type Override = { kind: "procedural" } | { kind: "plate"; key: CinematicPlateKey } | null;

/**
 * Development-only `?plate=` override for visual review. Never active in
 * production and never touches real weather data — it only forces which plate
 * the compositor shows: `?plate=rain`, `?plate=clear-night`, `?plate=procedural`.
 */
function parseOverride(search: string): Override {
  if (!IS_DEV) return null;
  const p = new URLSearchParams(search).get("plate");
  if (!p) return null;
  if (p === "procedural") return { kind: "procedural" };
  if ((CINEMATIC_PLATE_KEYS as string[]).includes(p)) return { kind: "plate", key: p as CinematicPlateKey };
  return null;
}

export default function CinematicWeatherPage() {
  const { snapshot, status, lastUpdatedAt } = useLiveSeoulWeather();
  // Shared A → /atmosphere, D → /diagnostics navigation (Esc → / is a no-op here).
  useWeatherViewShortcuts();

  // Client-only capability detection (avoids any SSR/hydration divergence).
  const [quality, setQuality] = useState<QualitySettings | null>(null);
  const [reduced, setReduced] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [plateFailed, setPlateFailed] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [override, setOverride] = useState<Override>(null);
  const [selection, setSelection] = useState<PlateSelection>(() => selectPlateFromSky(null));
  const [activeFormat, setActiveFormat] = useState<string | null>(null);
  const [lastTransition, setLastTransition] = useState<number | null>(null);
  const safety = useRef<number | null>(null);
  const snapshotRef = useRef(snapshot);

  useEffect(() => {
    setQuality(detectQuality());
    setReduced(prefersReducedMotion());
    setWebgl(hasWebGL());
    setOverride(parseOverride(window.location.search));
    // Never let the loader get stuck, whatever happens downstream.
    safety.current = window.setTimeout(() => setReveal(true), 6000);
    return () => {
      if (safety.current) window.clearTimeout(safety.current);
    };
  }, []);

  // Re-evaluate plate selection when fresh weather arrives AND on a slow tick,
  // so dawn/sunset/night boundaries are caught between 12-minute data refreshes.
  useEffect(() => {
    snapshotRef.current = snapshot;
    setSelection(selectPlateFromSky(snapshot));
    const id = window.setInterval(
      () => setSelection(selectPlateFromSky(snapshotRef.current)),
      60_000,
    );
    return () => window.clearInterval(id);
  }, [snapshot]);

  // --- resolve the render mode ------------------------------------------------
  const forcedProcedural = override?.kind === "procedural";
  const forcedKey = override?.kind === "plate" ? override.key : null;
  const activeKey = forcedKey ?? selection.key;

  // Give a freshly-selected plate a clean chance before deciding it failed.
  useEffect(() => {
    setPlateFailed(false);
    setActiveFormat(null);
  }, [activeKey]);

  const canvasOk = webgl && !canvasFailed;
  const plateGenerated = forcedKey != null ? true : isPlateGenerated(activeKey);
  // A dev-forced plate always attempts (the whole point of review); otherwise
  // require the master switch, an actually-generated file, and full motion.
  const wantPlate =
    forcedKey != null
      ? !plateFailed
      : PLATES_ENABLED && !forcedProcedural && !plateFailed && plateGenerated && !reduced;

  const mode: CinematicRenderMode = wantPlate ? "hybrid" : canvasOk ? "procedural" : "fallback-2d";
  const showVideo = wantPlate;
  const showCanvas = canvasOk; // hybrid (transparent) or procedural (opaque)
  const show2dFallback = !canvasOk && !showVideo;

  // A single, plain-English explanation of why we're NOT in hybrid (for
  // /diagnostics). Null while hybrid is actually carrying the experience.
  const fallbackReason: string | null =
    mode === "hybrid"
      ? null
      : !canvasOk
        ? "WebGL unavailable — 2D fallback"
        : forcedProcedural
          ? "dev override: ?plate=procedural"
          : !PLATES_ENABLED
            ? "plates disabled (NEXT_PUBLIC_CINEMATIC_PLATES=0)"
            : reduced
              ? "reduced motion — procedural scene"
              : plateFailed
                ? `plate "${activeKey}" failed to play — procedural scene`
                : !plateGenerated
                  ? `no video for "${activeKey}" — procedural scene`
                  : "procedural scene";

  // The 2D fallback paints instantly — reveal shortly after it mounts.
  useEffect(() => {
    if (show2dFallback) {
      const id = window.setTimeout(() => setReveal(true), 500);
      return () => window.clearTimeout(id);
    }
  }, [show2dFallback]);

  // Publish a plain-serializable runtime status for /diagnostics (no secrets,
  // no DOM nodes, no three.js objects).
  useEffect(() => {
    writeCinematicStatus({
      renderMode: mode,
      plateKey: activeKey,
      plateAvailable: isPlateGenerated(activeKey),
      activeFormat: showVideo ? activeFormat : null,
      loadState: showVideo ? (plateFailed ? "error" : activeFormat ? "playing" : "loading") : "idle",
      selectionReason: forcedKey ? `dev override: ?plate=${forcedKey}` : selection.reason,
      timePhase: selection.phase,
      lastTransitionAt: lastTransition,
      lastError: plateFailed ? `plate "${activeKey}" unavailable — procedural fallback` : null,
      fallbackReason,
      proceduralFallback: mode !== "hybrid",
      updatedAt: Date.now(),
    });
  }, [mode, activeKey, activeFormat, showVideo, plateFailed, selection, forcedKey, lastTransition, fallbackReason]);

  const onPlateReady = useCallback(() => setReveal(true), []);
  const onPlateFailed = useCallback(() => setPlateFailed(true), []);
  const onPlateTransition = useCallback(() => setLastTransition(Date.now()), []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-black">
      {/* Layer 1 — the cinematic video base plate (z-0). */}
      {quality && showVideo && (
        <CinematicPlate
          activeKey={activeKey}
          reducedMotion={reduced}
          // Dual-buffer seamless loop on capable tiers; a single native-loop
          // video on the low-power/mobile tier (one decoder at a time).
          seamless={quality.tier !== "reduced"}
          onReady={onPlateReady}
          onFailed={onPlateFailed}
          onTransition={onPlateTransition}
          onFormat={setActiveFormat}
        />
      )}

      {/* Layers 2–3 — the real-time scene. Transparent over the plate in hybrid
          (z-10), the full opaque world in procedural (z-0). */}
      {quality && showCanvas && (
        <div className={showVideo ? "absolute inset-0 z-10" : "absolute inset-0 z-0"}>
          <CanvasBoundary onError={() => setCanvasFailed(true)}>
            <SeoulSkyCanvas
              snapshot={snapshot}
              quality={quality}
              reducedMotion={reduced}
              renderMode={showVideo ? "hybrid" : "procedural"}
              onReady={() => setReveal(true)}
            />
          </CanvasBoundary>
        </div>
      )}

      {quality && show2dFallback && <WebGLFallback snapshot={snapshot} />}

      {/* Layer 4 — filmic grade (+ live atmosphere cast in hybrid). */}
      <CinematicGrade reducedMotion={reduced} snapshot={snapshot} mode={mode} />

      {/* Layer 5 — the minimal Korean weather overlay. */}
      {reveal && (
        <MinimalWeatherOverlay snapshot={snapshot} status={status} lastUpdatedAt={lastUpdatedAt} />
      )}

      <AnimatePresence>
        {!reveal && <CinematicLoader message={status === "error" ? "서울의 하늘을 불러오는 중" : undefined} />}
      </AnimatePresence>
    </main>
  );
}
