"use client";

import type { ReactNode } from "react";
import type { WeatherStatus } from "@/hooks/useLiveSeoulWeather";

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

/** A Korean film-chapter title that opens each scene in the data narrative. */
export function SectionHeading({
  index,
  title,
  description,
  compact = false,
}: {
  index: string;
  title: string;
  description?: string;
  compact?: boolean;
}) {
  return (
    <div className={`${compact ? "mb-8 sm:mb-10" : "mb-12"} flex max-w-3xl items-start gap-5 sm:gap-7`}>
      <span className="sky-film-index mt-1 font-mono text-[10px] tabular-nums tracking-[0.28em] text-white/60">
        장면 {index}
      </span>
      <span aria-hidden className="mt-3 h-px w-10 shrink-0 bg-white/25 sm:w-16" />
      <div>
        <h2 className="sky-display m-0 break-keep text-[clamp(2rem,4.2vw,4rem)] text-white">
          {title}
        </h2>
        {description && (
          <p className="sky-copy mt-3 break-keep text-sm font-light text-white/72 sm:text-base">
            {description}
          </p>
        )}
      </div>
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
  const label = status === "live" ? "실시간" : status === "error" ? "저장된 관측" : "관측 갱신 중";
  const dot = status === "live" ? "bg-emerald-300" : status === "error" ? "bg-amber-300" : "bg-white/60";
  return (
    <span className="flex items-center gap-2">
      <span
        className={`h-1.5 w-1.5 rounded-full ${dot} ${
          status !== "error" ? "animate-pulse" : ""
        }`}
      />
      <span className={`font-sans font-medium tracking-[0.12em] text-white/70 ${labelClassName}`}>{label}</span>
    </span>
  );
}
