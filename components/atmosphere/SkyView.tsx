"use client";

import { buildSkyPalette } from "@/lib/cinematic/skyPalette";
import { useSkyImage } from "./scene/SkyImageContext";
import ArrivalSection from "./sections/ArrivalSection";
import ForecastSection from "./sections/ForecastSection";
import GroundStationSection from "./sections/GroundStationSection";
import InstrumentsSection from "./sections/InstrumentsSection";
import RadarSection from "./sections/RadarSection";
import { useWeatherField, useWeatherView } from "./WeatherFieldContext";

/**
 * The readable HUD over the live scene at /sky. Two discrete, keyboard-toggled
 * views share the viewport (desktop only): D toggles between them, Esc returns to
 * the hero — the state lives in {@link WeatherExperienceShell}.
 *
 *   • Hero — the full-screen live view (the still landmark plate on the fixed
 *     SceneStage below) with the de-glassed Arrival readout floating over it and a
 *     subtle "press D" hint. No scroll.
 *   • Data — the rest of the dashboard (instruments → radar → forecast → ground station)
 *     in a self-contained scrolling container with its own opaque day/night
 *     gradient backdrop, so nothing heavy renders behind it (the scene is paused).
 *
 * Both layers are always mounted and cross-fade in place on the toggle (~500ms,
 * pure opacity — no slide/zoom), so the only transition is the D-toggle and there
 * is no scroll-coupled opacity. Because the data backdrop is the hero plate at
 * identical geometry (only blurred), the D-toggle reads as the SAME scene blurring
 * where it sits — co-registered, no jump.
 *
 * The whole foreground is wrapped so the day/night palette ({@link buildSkyPalette})
 * applies as CSS variables once, here: the gradient colours, the panel surfaces,
 * and a remap of Tailwind's `white` so existing `text-white/*` becomes the correct
 * ink for the current sky.
 */
export default function SkyView() {
  const { isDay, dayFactor, goldenFactor, readout } = useWeatherField();
  const { src: plateSrc } = useSkyImage();
  const view = useWeatherView();
  const isHero = view === "hero";

  return (
    <div className="sky-foreground" style={buildSkyPalette(isDay, dayFactor, goldenFactor, readout.condition)}>
      {/* Hero layer — the de-glassed Arrival readout over the live view. */}
      <div
        className={`sky-hero-layer text-white ${isHero ? "is-active" : ""}`}
        aria-hidden={!isHero}
        inert={!isHero}
      >
        <ArrivalSection />

        {/* Subtle keyboard hint — the only navigation affordance. */}
        <div className="sky-on-media pointer-events-none absolute inset-x-0 bottom-[clamp(1.75rem,5vh,3.25rem)] z-10 flex items-center justify-center gap-2.5">
          <kbd className="rounded border border-white/30 px-1.5 py-0.5 font-mono text-[11px] tracking-wider text-white/75">
            D
          </kbd>
          <span className="font-mono text-[11px] uppercase tracking-[0.34em] text-white/55">
            데이터 · explore
          </span>
        </div>
      </div>

      {/* Data layer — the scrolling dashboard with its own gradient backdrop. */}
      <div
        className={`sky-data-layer ${!isHero ? "is-active" : ""}`}
        aria-hidden={isHero}
        inert={isHero}
      >
        {/* Data backdrop. When a still plate is showing it is reused here at the
            EXACT geometry of the hero plate (inset 0, cover, centred, same
            scene-pushin) — only blurred + darkened behind the data grid — so the
            D-toggle blurs the SAME co-registered scene in place, no shift. With no
            plate (the procedural fallback) it shows the ambient sky field: 4 independently drifting
            colour blooms + a breathing veil + animated matte grain. All layers
            fade with the data layer so the scene behind never shows through. */}
        <div aria-hidden className="sky-data-bg pointer-events-none">
          {plateSrc ? (
            <>
              <div className="sky-data-plate scene-pushin" style={{ backgroundImage: `url("${plateSrc}")` }} />
              <div className="sky-data-scrim" />
            </>
          ) : (
            <>
              <div className="sky-amb-base" />
              <div className="sky-amb-bloom sky-amb-bloom-a" />
              <div className="sky-amb-bloom sky-amb-bloom-b" />
              <div className="sky-amb-bloom sky-amb-bloom-c" />
              <div className="sky-amb-bloom sky-amb-bloom-d" />
              <div className="sky-amb-breath" />
              <div className="sky-grain" />
            </>
          )}
        </div>

        <div className="sky-data-scroll scroll-thin">
          <div className="relative z-10 text-white">
            <InstrumentsSection />
            <RadarSection />
            <ForecastSection />
            <GroundStationSection />
          </div>
        </div>
      </div>
    </div>
  );
}
