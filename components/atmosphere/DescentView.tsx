"use client";

import CloudDeckBand from "./bands/CloudDeckBand";
import GroundBand from "./bands/GroundBand";
import SurfaceBand from "./bands/SurfaceBand";
import TitleBand from "./bands/TitleBand";
import UpperAirBand from "./bands/UpperAirBand";
import { Band } from "./descentMotion";

/**
 * The Descent — the single banded foreground over the shared, fixed atmospheric
 * field. You fall from the upper atmosphere (band 1) down to the ground-station
 * data deck (band 5), and the field's altitude ramp (driven by its own damped
 * scroll ref) re-grades the sky as you go.
 *
 * All five bands are etched readouts over the field — no cards. A soft directional
 * scrim protects the upper-band type; the dense ground band gets its own deepening
 * local scrim so the data deck stays readable over the near-ground glow.
 */

export default function DescentView() {
  return (
    <>
      {/* Soft directional reading scrim (mobile: bottom-up; desktop: left→center). */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 sm:hidden"
        style={{
          background:
            "linear-gradient(to top, rgba(2,3,8,0.78) 0%, rgba(2,3,8,0.34) 48%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 hidden sm:block"
        style={{
          background:
            "linear-gradient(102deg, rgba(2,3,8,0.82) 0%, rgba(2,3,8,0.42) 30%, transparent 62%)",
        }}
      />

      {/* The five descent bands. */}
      <div className="relative z-20 text-white">
        <Band>
          <TitleBand />
        </Band>
        <Band>
          <UpperAirBand />
        </Band>
        <Band>
          <CloudDeckBand />
        </Band>
        <Band>
          <SurfaceBand />
        </Band>

        {/* Band 5 — ground station. The #ground deep-link / "D" jump lands here.
            A local scrim (transparent at the top so the descent into it is smooth)
            deepens under the dense data deck for readability. */}
        <section id="ground" className="relative scroll-mt-0">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, rgba(2,3,8,0.72) 14%, rgba(4,6,13,0.9) 100%)",
            }}
          />
          <div className="relative">
            <GroundBand />
          </div>
        </section>
      </div>
    </>
  );
}
