"use client";

import type { ReactNode } from "react";

/**
 * The single readable surface used across the /sky HUD. Once liquid glass, now a
 * plain matte panel: an opaque day/night-aware fill, a hairline border and a soft
 * shadow — no backdrop blur, no specular sheen, no scrim. The surface and its text
 * colour follow the sky (cream + deep-navy ink by day, a navy lift + cream ink at
 * night) via the `--sky-panel-*` and `--color-white` variables set on the
 * `.sky-foreground` wrapper, so legibility holds over any clip or gradient.
 *
 * The name and prop API are unchanged so every call site keeps working as-is; the
 * day/night response is entirely in the `.sky-panel` material (see globals.css).
 */
export default function GlassPanel({
  children,
  className = "",
  radius = "rounded-[22px]",
  elevated = false,
}: {
  children: ReactNode;
  className?: string;
  /** Tailwind radius class — restrained by default; tiles can go tighter. */
  radius?: string;
  /** Adds top-lit inner gradient + desktop hover lift (instrument tiles). */
  elevated?: boolean;
}) {
  return (
    <div className={`sky-panel ${elevated ? "sky-panel-elevated" : ""} ${radius} ${className}`}>
      {children}
    </div>
  );
}
