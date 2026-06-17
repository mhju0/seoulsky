"use client";

import dynamic from "next/dynamic";
import { useInView } from "framer-motion";
import { useRef } from "react";
import GlassPanel from "../glass/GlassPanel";
import { MetricLabel } from "../EtchedType";
import { ScrollReveal } from "../descentMotion";
import { useWeatherClock, useWeatherField } from "../WeatherFieldContext";
import { SectionHeading, SkySection } from "./SectionParts";
import SunArc from "./SunArc";

/**
 * Section 4 — Sun & Sky. The celestial deck: the hero 24-hour day/night dial
 * (sun/moon position, crossing labels, moon phase, time-to-next-event) over the
 * wind trend chart. Both read from the shared sky snapshot in context — no extra
 * fetch. The dial is the centred, square hero; the wind graph (lazy Recharts)
 * sits in a full-width card below it.
 */

// Recharts is heavy — only pull its chunk in when the wind graph actually mounts.
const WindGraph = dynamic(() => import("./WindGraph"), {
  ssr: false,
  loading: () => <WindPlaceholder />,
});

/** The pulse shown before the wind graph is near + while its chunk loads. */
function WindPlaceholder() {
  return <div className="h-full min-h-[220px] w-full animate-pulse rounded-lg bg-white/[0.03]" />;
}

export default function SunSkySection() {
  const { snapshot, isDay } = useWeatherField();
  const clock = useWeatherClock();

  // Defer the heavy Recharts chunk until the wind panel is approaching — the
  // dynamic import only fires once <WindGraph> first renders, so gating its
  // mount here keeps Recharts off the initial /sky load entirely.
  const windRef = useRef<HTMLDivElement>(null);
  const windNear = useInView(windRef, { once: true, margin: "0px 0px 300px 0px" });

  const hourly = snapshot?.hourly ?? [];

  return (
    <SkySection>
      <SectionHeading index="04" en="Sun & Sky" ko="해 · 하늘" />

      <div className="mx-auto flex w-full max-w-[58rem] flex-col gap-9 sm:gap-12">
        {/* Hero dial — centred, square, with generous room around the circle. */}
        <ScrollReveal className="mx-auto w-full max-w-[34rem]" amount={0.15}>
          <GlassPanel className="px-7 py-8 sm:px-9 sm:py-10">
            <SunArc
              sunrise={snapshot?.sun.sunrise ?? null}
              sunset={snapshot?.sun.sunset ?? null}
              now={clock}
              isDay={isDay}
            />
          </GlassPanel>
        </ScrollReveal>

        {/* Wind trend — a full-width card balanced beneath the dial. */}
        <ScrollReveal amount={0.2} delay={0.08}>
          <GlassPanel className="px-5 py-6 sm:px-7 sm:py-7">
            <div className="flex flex-col">
              <MetricLabel className="mb-5">Wind · 바람 · m/s</MetricLabel>
              <div ref={windRef} className="min-h-[240px] flex-1">
                {hourly.length > 0 ? (
                  windNear ? <WindGraph hourly={hourly} isDay={isDay} /> : <WindPlaceholder />
                ) : (
                  <div className="flex h-full min-h-[240px] items-center font-mono text-[11px] uppercase tracking-[0.2em] text-white/45">
                    바람 예보 없음
                  </div>
                )}
              </div>
            </div>
          </GlassPanel>
        </ScrollReveal>
      </div>
    </SkySection>
  );
}
