"use client";

import { useMotionValue } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Component,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLiveSeoulWeather } from "@/hooks/useLiveSeoulWeather";
import {
  detectQuality,
  hasWebGL,
  prefersReducedMotion,
  type QualitySettings,
} from "@/components/three/quality";
import { CHAPTERS } from "@/lib/data-experience/chapters";
import DataFallback from "./DataFallback";
import DataGrade from "./overlays/DataGrade";
import ChapterOverlays, { MonumentalBackdrop } from "./overlays/ChapterOverlays";

// three.js + the whole core scene load client-side only.
const AtmosphericDataCanvas = dynamic(() => import("./AtmosphericDataCanvas"), {
  ssr: false,
  loading: () => null,
});

/** Swap to the CSS fallback if the WebGL scene throws at runtime. */
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

function Loader() {
  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[#04060d]">
      <div className="text-center">
        <div className="mx-auto h-2 w-2 animate-ping rounded-full bg-white/70" />
        <div className="mt-4 text-[10px] uppercase tracking-[0.36em] text-white/45">
          서울 대기 코어 동기화 중
        </div>
      </div>
    </div>
  );
}

export default function AtmosphericDataPage() {
  const { snapshot, status } = useLiveSeoulWeather();

  // Own the scroll-progress MotionValue rather than framer-motion's useScroll:
  // the experience swaps a short loader for five full-height sections after
  // capability detection, and useScroll measured the document during the loader
  // phase and didn't re-measure when the content grew. A ResizeObserver keeps
  // this correct as the page height changes; subscribers (overlays) and the
  // scene (per-frame .get()) read the same value. No `motion` element binds it,
  // so there's no WAAPI handoff to choke on a momentarily-NaN value.
  const scrollYProgress = useMotionValue(0);
  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollYProgress.set(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, [scrollYProgress]);

  // Client-only capability detection (avoids any SSR/hydration divergence).
  const [quality, setQuality] = useState<QualitySettings | null>(null);
  const [reduced, setReduced] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [canvasFailed, setCanvasFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setQuality(detectQuality());
    setReduced(prefersReducedMotion());
    setWebgl(hasWebGL());
    // Never let the loader get stuck, whatever happens downstream.
    const safety = window.setTimeout(() => setReady(true), 5000);
    return () => window.clearTimeout(safety);
  }, []);

  // Pause the render loop while the tab is hidden (battery / GPU).
  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const useFallback = !webgl || canvasFailed;

  // Pre-detection (and SSR): a calm loader, no canvas, no hydration mismatch.
  if (!quality) return <Loader />;

  if (useFallback) return <DataFallback snapshot={snapshot} status={status} />;

  return (
    <main className="relative bg-[#04060d] text-white">
      {/* Layer 0 — monumental ghost values BEHIND the core. */}
      <MonumentalBackdrop
        scrollYProgress={scrollYProgress}
        snapshot={snapshot}
        status={status}
        reducedMotion={reduced}
      />

      {/* Layer 1 — the transparent WebGL core (fixed; never recreated on scroll). */}
      <div className="pointer-events-none fixed inset-0 z-10">
        <CanvasBoundary onError={() => setCanvasFailed(true)}>
          <AtmosphericDataCanvas
            snapshot={snapshot}
            scrollMV={scrollYProgress}
            quality={quality}
            reducedMotion={reduced}
            frameloop={hidden ? "never" : "always"}
            onReady={() => setReady(true)}
          />
        </CanvasBoundary>
      </div>

      {/* Layer 2 — filmic grade + accent wash. */}
      <DataGrade snapshot={snapshot} reducedMotion={reduced} />

      {/* Layer 3 — foreground HUD typography. */}
      <ChapterOverlays
        scrollYProgress={scrollYProgress}
        snapshot={snapshot}
        status={status}
        reducedMotion={reduced}
      />

      {/* Scroll distance — five empty full-height spacers behind the fixed layers. */}
      <div aria-hidden className="relative z-0">
        {CHAPTERS.map((c) => (
          <section key={c.id} className="h-svh" />
        ))}
      </div>

      {!ready && <Loader />}
    </main>
  );
}
