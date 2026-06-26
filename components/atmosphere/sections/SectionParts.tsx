"use client";

import type { ReactNode } from "react";
import type { WeatherStatus } from "@/hooks/useLiveSeoulWeather";
import { MetricLabel } from "../EtchedType";

/**
 * Shared chrome for the four /sky scroll sections — the section shell, the quiet
 * EN·KO heading, and the live-status badge. Pure presentation; the panels and the
 * data live in the section bodies. Every section flows in the normal document
 * scroll over the fixed scene, so reveal/parallax here never drives the scene.
 */

/** One full-height scroll section with the shared reading gutter. */
export function SkySection({
  id,
  children,
  center = false,
  className = "",
}: {
  id?: string;
  children: ReactNode;
  /** Vertically centre the content (the arrival hero); else top-align. */
  center?: boolean;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`relative flex min-h-svh w-full scroll-mt-0 flex-col px-[clamp(1.25rem,4vw,3.25rem)] ${
        center
          ? "justify-center py-[clamp(3rem,12vh,8rem)]"
          : "justify-start py-[clamp(4rem,10vh,7rem)]"
      } ${className}`}
    >
      {children}
    </section>
  );
}

/** The etched caption that opens a section: an index, a hairline tick, EN · KO. */
export function SectionHeading({ index, en, ko }: { index: string; en: string; ko: string }) {
  return (
    <div className="mb-9 flex items-center gap-4">
      <span className="font-mono text-[12px] tabular-nums tracking-[0.3em] text-white">{index}</span>
      <span aria-hidden className="h-px w-12 bg-white/20" />
      <MetricLabel tone="bright">
        {en} · {ko}
      </MetricLabel>
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
