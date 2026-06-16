"use client";

import { useReducedMotion } from "framer-motion";
import { useScrollSheen } from "./glass/useScrollSheen";
import ArrivalSection from "./sections/ArrivalSection";
import ForecastSection from "./sections/ForecastSection";
import GroundStationSection from "./sections/GroundStationSection";
import InstrumentsSection from "./sections/InstrumentsSection";

/**
 * The floating liquid-glass HUD over the live scene at /sky. Four sections in one
 * continuous document scroll — arrival → instruments → forecast → ground station —
 * all reading the single shared snapshot from {@link WeatherExperienceShell}; the
 * shuffling video gallery lives behind, on the fixed SceneStage.
 *
 * The reveals + sheen here are pure foreground motion (Framer MotionValues +
 * IntersectionObserver, plus one shared scroll var for the specular drift). They
 * never drive the gallery or FX — the scene reads scroll from its own passive ref.
 */
export default function SkyView() {
  const reduce = useReducedMotion();
  // One passive scroll listener powers the specular sheen on every glass panel.
  useScrollSheen(!!reduce);

  return (
    <>
      {/* A very soft top/bottom reading scrim — lighter than the panels' own
          scrims — keeping section headings legible over the brightest clips while
          the glass still reads as glass. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          background:
            "linear-gradient(180deg, rgba(2,4,10,0.30) 0%, transparent 17%, transparent 82%, rgba(2,4,10,0.42) 100%)",
        }}
      />

      <div className="relative z-20 text-white">
        <ArrivalSection />
        <InstrumentsSection />
        <ForecastSection />
        <GroundStationSection />
      </div>
    </>
  );
}
