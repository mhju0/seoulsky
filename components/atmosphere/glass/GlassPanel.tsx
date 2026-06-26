"use client";

import type { ReactNode } from "react";

/**
 * The single readable surface used across the /sky HUD. An iOS-26 "Liquid Glass"
 * panel: a barely-there tint over a luminous backdrop blur, with a bright specular
 * edge (rim + crisp top/bottom inner highlights + soft drop shadow) — the cinematic
 * scene shows clearly through it. Its tint and ink flip with the backdrop brightness
 * (a light tint + dark ink over a bright sky, a dark tint + near-white ink over a
 * dark one) via the `--sky-panel-*` variables set on the `.sky-foreground` wrapper,
 * which re-scope `--color-white` inside the panel so all text/glyphs follow.
 *
 * The name and prop API are unchanged so every call site keeps working as-is; the
 * day/night response is entirely in the `.sky-panel` material (see globals.css).
 *
 * Radius: with no `radius` prop the panel inherits the capsule `--sky-panel-radius`
 * token; pass a Tailwind radius class to override it per card.
 */
export default function GlassPanel({
  children,
  className = "",
  radius,
  elevated = false,
}: {
  children: ReactNode;
  className?: string;
  /** Tailwind radius class to override the capsule token for one card. */
  radius?: string;
  /** Adds top-lit inner gradient + desktop hover lift (instrument tiles). */
  elevated?: boolean;
}) {
  return (
    <div className={`sky-panel ${elevated ? "sky-panel-elevated" : ""} ${radius ?? ""} ${className}`}>
      {children}
    </div>
  );
}
