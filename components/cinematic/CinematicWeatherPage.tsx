"use client";

import { AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveSeoulWeather } from "@/hooks/useLiveSeoulWeather";
import { detectQuality, hasWebGL, prefersReducedMotion, type QualitySettings } from "@/components/three/quality";
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

const PLATES_ENABLED = process.env.NEXT_PUBLIC_CINEMATIC_PLATES === "1";

export default function CinematicWeatherPage() {
  const router = useRouter();
  const { snapshot, status, lastUpdatedAt } = useLiveSeoulWeather();

  // Client-only capability detection (avoids any SSR/hydration divergence).
  const [quality, setQuality] = useState<QualitySettings | null>(null);
  const [reduced, setReduced] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [reveal, setReveal] = useState(false);
  const safety = useRef<number | null>(null);

  useEffect(() => {
    setQuality(detectQuality());
    setReduced(prefersReducedMotion());
    setWebgl(hasWebGL());
    // Never let the loader get stuck, whatever happens downstream.
    safety.current = window.setTimeout(() => setReveal(true), 6000);
    return () => {
      if (safety.current) window.clearTimeout(safety.current);
    };
  }, []);

  // The 2D fallback paints instantly — reveal shortly after mount.
  const useFallback = !webgl || canvasFailed;
  useEffect(() => {
    if (useFallback) {
      const id = window.setTimeout(() => setReveal(true), 500);
      return () => window.clearTimeout(id);
    }
  }, [useFallback]);

  // 'D' → diagnostics.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "d" || e.key === "D") && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        router.push("/diagnostics");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <main className="fixed inset-0 overflow-hidden bg-black">
      {quality && !useFallback && (
        <CanvasBoundary onError={() => setCanvasFailed(true)}>
          <SeoulSkyCanvas
            snapshot={snapshot}
            quality={quality}
            reducedMotion={reduced}
            onReady={() => setReveal(true)}
          />
        </CanvasBoundary>
      )}

      {useFallback && <WebGLFallback snapshot={snapshot} />}

      <CinematicPlate snapshot={snapshot} enabled={PLATES_ENABLED} />

      {/* Filmic grade (vignette + grain) over the scene, beneath the HUD text. */}
      <CinematicGrade reducedMotion={reduced} />

      {reveal && (
        <MinimalWeatherOverlay snapshot={snapshot} status={status} lastUpdatedAt={lastUpdatedAt} />
      )}

      <AnimatePresence>
        {!reveal && <CinematicLoader message={status === "error" ? "서울의 하늘을 불러오는 중" : undefined} />}
      </AnimatePresence>
    </main>
  );
}
