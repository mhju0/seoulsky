"use client";

import { useEffect } from "react";

/**
 * Drives the liquid-glass specular sheen for the WHOLE page from a single passive,
 * rAF-coalesced scroll listener. It writes one number into the `--sky-sheen` CSS
 * variable on <html>; every `.liquid-glass-sheen` layer translates by it, so the
 * highlight drifts a few px as you scroll with zero per-frame React renders and no
 * per-panel listeners.
 *
 * The drift is a bounded sine of scroll position (not a raw clamp), so the sheen
 * glides gently back and forth as you move through the page instead of pinning at
 * an extreme. Under reduced motion the listener never attaches and the variable
 * stays unset (→ 0px fallback), holding every highlight perfectly still.
 */

/** Peak specular drift, in px (kept tiny — this is a glint, not a parallax move). */
const SHEEN_PX = 5;
/** Scroll distance (px) over one full sine period of the drift. */
const SHEEN_PERIOD = 1040;

export function useScrollSheen(reducedMotion: boolean): void {
  useEffect(() => {
    if (reducedMotion) return;
    const root = document.documentElement;
    let ticking = false;
    const apply = () => {
      ticking = false;
      const offset = Math.sin((window.scrollY / SHEEN_PERIOD) * Math.PI * 2) * SHEEN_PX;
      root.style.setProperty("--sky-sheen", `${offset.toFixed(2)}px`);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      root.style.removeProperty("--sky-sheen");
    };
  }, [reducedMotion]);
}
