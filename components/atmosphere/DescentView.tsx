"use client";

import DiagnosticsView from "./DiagnosticsView";
import CloudDeckBand from "./bands/CloudDeckBand";
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
 * Bands 1–4 are live etched readouts over the field; band 5 wires the existing
 * diagnostics content as a placeholder (restyled in T4.1). A soft directional
 * scrim keeps the foreground type readable across the whole scroll without a
 * hard divider.
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
            DiagnosticsView is wired in as a placeholder and is restyled into the
            etched aesthetic in T4.1. */}
        <section id="ground" className="relative scroll-mt-0">
          <DiagnosticsView />
        </section>
      </div>
    </>
  );
}
