"use client";

import type { ReactNode } from "react";
import type { WeatherStatus } from "@/hooks/useLiveSeoulWeather";
import { MetricLabel } from "../EtchedType";

/**
 * Shared chrome for the four /sky scroll sections — the section shell, the quiet
 * KO·EN heading, and the live-status badge. Pure presentation; the panels and the
 * data live in the section bodies. Every section flows in the normal document
 * scroll over the fixed scene, so reveal/parallax here never drives the scene.
 */

/** One full-height scroll section with the shared reading gutter. */
export function SkySection({
  id,
  children,
  center = false,
  compact = false,
  className = "",
}: {
  id?: string;
  children: ReactNode;
  /** Vertically centre the content (the arrival hero); else top-align. */
  center?: boolean;
  /** Tighter vertical rhythm for dense data sections on laptop-height screens. */
  compact?: boolean;
  className?: string;
}) {
  const padding = center
    ? "justify-center py-[clamp(3rem,12vh,8rem)]"
    : compact
      ? "justify-start py-[clamp(2.5rem,6vh,5rem)]"
      : "justify-start py-[clamp(4rem,10vh,7rem)]";

  return (
    <section
      id={id}
      className={`relative flex min-h-svh w-full scroll-mt-0 flex-col px-[clamp(1.25rem,4vw,3.25rem)] ${padding} ${className}`}
    >
      {children}
    </section>
  );
}

/** The etched caption that opens a section: an index, a hairline tick, KO · EN. */
export function SectionHeading({
  index,
  en,
  ko,
  compact = false,
}: {
  index: string;
  en: string;
  ko: string;
  compact?: boolean;
}) {
  return (
    <div className={`${compact ? "mb-6 sm:mb-7" : "mb-9"} flex items-center gap-4`}>
      <span className="font-mono text-[12px] tabular-nums tracking-[0.3em] text-white">{index}</span>
      <span aria-hidden className="h-px w-12 bg-white/20" />
      <h2 className="m-0">
        <MetricLabel tone="bright">
          {ko} · {en}
        </MetricLabel>
      </h2>
    </div>
  );
}

/** Live / cached / syncing badge with a pulsing dot, reused by arrival + ground.
 * `labelClassName` overrides the label's text size at the call site (arrival sizes
 * it up to sit with its larger header). */
export function LiveBadge({
  status,
  labelClassName = "text-[10px]",
}: {
  status: WeatherStatus;
  labelClassName?: string;
}) {
  const label = status === "live" ? "LIVE" : status === "error" ? "CACHED" : "SYNCING";
  const dot = status === "live" ? "bg-emerald-300" : status === "error" ? "bg-amber-300" : "bg-white/60";
  return (
    <span className="flex items-center gap-2">
      <span
        className={`h-1.5 w-1.5 rounded-full ${dot} ${
          status !== "error" ? "animate-pulse" : ""
        }`}
      />
      <span className={`font-mono uppercase tracking-[0.3em] text-white/65 ${labelClassName}`}>{label}</span>
    </span>
  );
}
