/**
 * A tiny, plain-serializable bridge for the cinematic runtime state.
 *
 * The home page (`/`) is the only place that actually knows the live render
 * mode, the playing plate, the chosen <source> format and any playback error.
 * `/diagnostics` is a separate route and cannot read that React state directly,
 * so the page writes a flat snapshot here (localStorage) and diagnostics reads
 * it back. Everything stored is a primitive — no DOM nodes, no three.js
 * objects, no URLs containing secrets — satisfying the "plain serializable
 * values only" rule for the diagnostics surface.
 */

export type CinematicRenderMode = "hybrid" | "procedural" | "fallback-2d";

export interface CinematicRuntimeStatus {
  renderMode: CinematicRenderMode;
  /** The plate key currently selected (whether or not its file exists). */
  plateKey: string | null;
  /** Does the manifest declare a real source file for this key? */
  plateAvailable: boolean;
  /** Which <source> the browser actually chose ("video/mp4" | "video/webm"). */
  activeFormat: string | null;
  /** Coarse video lifecycle for the active plate. */
  loadState: "idle" | "loading" | "playing" | "error";
  /** Short English reason the selector chose this plate. */
  selectionReason: string;
  /** Continuous sun phase at selection time (e.g. "daytime", "sunset"). */
  timePhase: string;
  /** Epoch ms of the last plate crossfade, or null. */
  lastTransitionAt: number | null;
  /** Last video playback error message, or null. */
  lastError: string | null;
  /** Why the page fell back from hybrid (no file / disabled / reduced motion / playback error / WebGL), or null while hybrid. */
  fallbackReason: string | null;
  /** True when the procedural three.js scene is carrying the experience. */
  proceduralFallback: boolean;
  updatedAt: number;
}

const STORAGE_KEY = "seoulsky:cinematic-status";

export function writeCinematicStatus(status: CinematicRuntimeStatus): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
  } catch {
    // Private mode / quota / disabled storage — diagnostics simply shows less.
  }
}

export function readCinematicStatus(): CinematicRuntimeStatus | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CinematicRuntimeStatus) : null;
  } catch {
    return null;
  }
}
