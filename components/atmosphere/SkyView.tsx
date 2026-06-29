"use client";

import { buildSkyPalette } from "@/lib/cinematic/skyPalette";
import { useSkyImage } from "./scene/SkyImageContext";
import ArrivalSection from "./sections/ArrivalSection";
import ForecastSection from "./sections/ForecastSection";
import GroundStationSection from "./sections/GroundStationSection";
import InstrumentsSection from "./sections/InstrumentsSection";
import RadarSection from "./sections/RadarSection";
import { useWeatherField, useWeatherView, useWeatherViewToggle } from "./WeatherFieldContext";

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
  const toggleView = useWeatherViewToggle();
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

        {/* The navigation affordance. Doubles as the touch entry point to the data
            deck (no keyboard on mobile): a real button firing the SAME shell toggle
            the D key calls. The full-width bar stays click-through; only the button
            itself captures taps, with generous padding for a comfortable hit area. */}
        <div className="sky-on-media pointer-events-none absolute inset-x-0 bottom-[clamp(1.75rem,5vh,3.25rem)] z-10 flex items-center justify-center">
          <button
            type="button"
            onClick={toggleView}
            aria-label="데이터 덱 열기"
            className="pointer-events-auto flex items-center gap-2.5 rounded-full px-4 py-2.5 transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
          >
            <kbd className="rounded border border-white/30 px-1.5 py-0.5 font-mono text-[11px] tracking-wider text-white/75">
              D
            </kbd>
            <span className="font-mono text-[11px] uppercase tracking-[0.34em] text-white/55">
              데이터 · explore
            </span>
          </button>
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

        {/* Return-to-hero affordance — the touch counterpart to the desktop Esc
            key, so mobile users (no keyboard) can leave the data deck. Fires the
            SAME shell toggle the D key calls; from the data view it returns to the
            hero. Pinned to the top-start of the viewport (it does not scroll with
            the deck) and inert with the whole data layer while the hero shows. The
            ESC hint only appears where a keyboard exists (sm+). */}
        <button
          type="button"
          onClick={toggleView}
          aria-label="처음 화면으로"
          className="absolute left-[clamp(1.25rem,4vw,3.25rem)] top-[clamp(1rem,3.2vh,1.9rem)] z-20 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="h-4 w-4 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span className="font-mono text-[11px] tracking-[0.28em] text-white">처음으로</span>
          <kbd className="hidden rounded border border-white/30 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-white/70 sm:inline-block">
            ESC
          </kbd>
        </button>
      </div>
    </div>
  );
}
