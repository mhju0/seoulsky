"use client";

import { useEffect, useRef } from "react";

/**
 * The spaceship CANOPY — a fixed foreground frame (layer (a) of the /sky scene),
 * NOT a 3D model. A dark, near-silhouetted cockpit surround that frames the
 * shuffling video view without competing with it: gently rounded top corners
 * with faint warm greeble lights, slim side pillars, and a suggestion of a
 * dashboard console along the bottom. The transparent "window" fills ~80% of the
 * frame; only the edges are opaque.
 *
 * Built entirely from layered CSS — the dark surround is a single huge
 * `box-shadow` cast OUTSIDE a rounded "window" element, so it scales perfectly to
 * any aspect ratio with no SVG distortion. It is the SAME frame across every clip
 * (the variety lives in the view behind it); a very slow idle drift + a few px of
 * scroll parallax keep it feeling alive. Everything holds still under
 * `prefers-reduced-motion`.
 */

/** Max scroll-driven parallax shift of the canopy, in px (kept deliberately tiny). */
const PARALLAX_PX = 10;

export default function CanopyOverlay({ reducedMotion }: { reducedMotion: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);

  // A few px of scroll parallax, written into a CSS var by a passive,
  // rAF-coalesced listener — no React re-render per frame. Held at 0 under
  // reduced motion (the listener never attaches).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || reducedMotion) return;
    let ticking = false;
    const apply = () => {
      ticking = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      // Drift gently upward as you descend — the cockpit settles into the view.
      el.style.setProperty("--canopy-y", `${(-p * PARALLAX_PX).toFixed(2)}px`);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [reducedMotion]);

  const greebleClass = reducedMotion ? "" : "animate-greeble";

  return (
    <div
      ref={rootRef}
      aria-hidden
      // Slightly oversized (inset -20px) so the parallax/breathe drift never
      // exposes a gap at the viewport edge — the dark surround must always reach
      // the frame edges.
      className="pointer-events-none absolute overflow-hidden"
      style={{
        top: "-20px",
        left: "-20px",
        right: "-20px",
        bottom: "-20px",
        ["--canopy-y" as string]: "0px",
        transform: "translate3d(0, var(--canopy-y), 0)",
      }}
    >
      {/* Inner wrapper carries the slow idle "breathing" drift, independent of the
          scroll-parallax transform on the root. */}
      <div className={`absolute inset-0 ${reducedMotion ? "" : "canopy-breathe"}`}>
        {/* The window: a transparent rounded cutout whose huge box-shadow paints
            the entire dark cockpit surround around it. A thin bright inner rim is
            the refractive glass edge; the deep inner shadow seats the frame. */}
        <div
          className="absolute"
          style={{
            top: "5.5%",
            left: "6.5%",
            right: "6.5%",
            bottom: "13%",
            borderRadius:
              "clamp(26px,6vw,92px) clamp(26px,6vw,92px) clamp(8px,1.5vw,22px) clamp(8px,1.5vw,22px)",
            boxShadow:
              "0 0 0 100vmax rgba(4,5,11,0.97)," +
              "inset 0 0 0 1px rgba(150,172,212,0.10)," +
              "inset 0 2px 44px rgba(120,150,205,0.05)," +
              "inset 0 -14px 70px rgba(0,0,0,0.42)",
          }}
        />

        {/* Slim side pillars — a faint vertical sheen over the dark surround. */}
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: "clamp(26px,7vw,120px)",
            background:
              "linear-gradient(90deg, rgba(26,30,44,0.55) 0%, rgba(12,15,24,0.25) 55%, transparent 100%)",
          }}
        />
        <div
          className="absolute inset-y-0 right-0"
          style={{
            width: "clamp(26px,7vw,120px)",
            background:
              "linear-gradient(270deg, rgba(26,30,44,0.55) 0%, rgba(12,15,24,0.25) 55%, transparent 100%)",
          }}
        />

        {/* Top brow — a soft deepening over the upper frame, where the greebles sit. */}
        <div
          className="absolute inset-x-0 top-0 h-[9%]"
          style={{ background: "linear-gradient(180deg, rgba(3,4,9,0.7) 0%, transparent 100%)" }}
        />

        {/* Warm greeble accent lights, clustered in the two upper corners. */}
        <div className="absolute left-[3%] top-[2.4%] flex gap-[6px]">
          <Greeble className={greebleClass} delay="0s" />
          <Greeble className={greebleClass} delay="1.3s" dim />
          <Greeble className={greebleClass} delay="2.1s" />
        </div>
        <div className="absolute right-[3%] top-[2.4%] flex gap-[6px]">
          <Greeble className={greebleClass} delay="0.7s" dim />
          <Greeble className={greebleClass} delay="1.8s" />
          <Greeble className={greebleClass} delay="2.6s" dim />
        </div>

        {/* Dashboard console along the bottom edge — a darker shelf with a thin
            lit lip and a faint row of instrument greebles. */}
        <div className="absolute inset-x-0 bottom-0 h-[13%]">
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(0deg, rgba(6,8,15,0.96) 0%, rgba(8,11,20,0.7) 55%, transparent 100%)",
            }}
          />
          {/* lit lip where the console meets the glass */}
          <div
            className="absolute inset-x-[6.5%] top-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(120,150,205,0.28), transparent)" }}
          />
          {/* instrument greeble row */}
          <div className="absolute inset-x-0 bottom-[28%] flex items-center justify-center gap-[10px]">
            <Greeble className={greebleClass} delay="0.4s" dim />
            <Greeble className={greebleClass} delay="1.1s" />
            <Greeble className={greebleClass} delay="0.9s" dim />
            <Greeble className={greebleClass} delay="1.9s" />
            <Greeble className={greebleClass} delay="2.4s" dim />
          </div>
        </div>
      </div>
    </div>
  );
}

/** One small warm cockpit indicator light with a soft glow. */
function Greeble({
  className = "",
  delay = "0s",
  dim = false,
}: {
  className?: string;
  delay?: string;
  dim?: boolean;
}) {
  return (
    <span
      className={className}
      style={{
        width: dim ? "3px" : "4px",
        height: dim ? "3px" : "4px",
        borderRadius: "9999px",
        background: dim ? "rgba(255,158,72,0.65)" : "rgba(255,178,96,0.92)",
        boxShadow: dim
          ? "0 0 5px 1px rgba(255,150,60,0.35)"
          : "0 0 8px 2px rgba(255,150,60,0.5)",
        ["--greeble-min" as string]: dim ? "0.3" : "0.5",
        animationDelay: delay,
      }}
    />
  );
}
