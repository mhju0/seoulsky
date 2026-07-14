"use client";

import type { ReactNode } from "react";

/**
 * The single framed surface used across the /sky HUD. It stays fully transparent
 * and uses a bright rim plus adaptive ink to remain readable over the cinematic
 * scene. The `--sky-panel-*` variables on `.sky-foreground` flip the ink and edge
 * contrast with the backdrop and re-scope `--color-white` so descendants follow.
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
  /** Adds a desktop hover lift without adding a background fill. */
  elevated?: boolean;
}) {
  return (
    <div className={`sky-panel ${elevated ? "sky-panel-elevated" : ""} ${radius ?? ""} ${className}`}>
      {children}
    </div>
  );
}
