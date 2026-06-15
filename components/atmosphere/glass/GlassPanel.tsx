"use client";

import type { ReactNode } from "react";

/**
 * The single liquid-glass surface used across the /sky HUD. It composes the
 * `.liquid-glass` material (see globals.css) with its two internal layers — the
 * adaptive legibility scrim and the scroll-driven specular sheen — and lifts the
 * children above both. Everything visible to the visitor is built from this; the
 * canopy and the shuffling video live behind it.
 *
 * It is purely presentational: no data, no scroll state, no effects. The specular
 * drift is driven entirely by the shared `--sky-sheen` CSS variable (written once
 * by {@link useScrollSheen}), so a page full of panels adds zero per-frame React
 * work and the sheen is held still under reduced motion.
 *
 * Restraint is deliberate: thin border, very low fill, large radius, and NO outer
 * shadow, so a panel reads as instrument glass rather than an app card.
 */
export default function GlassPanel({
  children,
  className = "",
  radius = "rounded-[22px]",
}: {
  children: ReactNode;
  className?: string;
  /** Tailwind radius class — restrained by default; tiles can go tighter. */
  radius?: string;
}) {
  return (
    <div className={`liquid-glass ${radius} ${className}`}>
      <span aria-hidden className="liquid-glass-scrim" />
      <span aria-hidden className="liquid-glass-sheen" />
      <div className="liquid-glass-content">{children}</div>
    </div>
  );
}
