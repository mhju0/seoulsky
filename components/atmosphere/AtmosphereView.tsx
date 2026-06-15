"use client";

import type { WeatherStatus } from "@/hooks/useLiveSeoulWeather";
import { useWeatherField } from "./WeatherFieldContext";
import WeatherMetricRail from "./WeatherMetricRail";
import WeatherTextPanel from "./WeatherTextPanel";

/**
 * The focused /atmosphere foreground: a left-protected information column over
 * the shared Atmospheric Color Field — a label + status, an unmissable
 * temperature block, and the restrained bottom metric rail. The atmospheric
 * light, clouds and precipitation live to the right; a directional scrim keeps
 * the far-left near-black so the type always reads, without a hard divider.
 */

function StatusPill({ status }: { status: WeatherStatus }) {
  const label = status === "live" ? "LIVE" : status === "error" ? "CACHED" : "SYNCING";
  const dot = status === "live" ? "bg-emerald-300" : status === "error" ? "bg-amber-300" : "bg-white/60";
  return (
    <div className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${status === "loading" ? "animate-pulse" : ""}`} />
      <span className="text-[10px] uppercase tracking-[0.3em] text-white/55">{label}</span>
    </div>
  );
}

export default function AtmosphereView() {
  const { readout, status, target, clock } = useWeatherField();

  return (
    <>
      {/* Layer 1 — scrims that protect the readable zone (above field, below text). */}
      {/* Mobile: a strong full-screen scrim. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 sm:hidden"
        style={{
          background:
            "linear-gradient(to top, rgba(2,3,8,0.92) 0%, rgba(2,3,8,0.58) 46%, rgba(2,3,8,0.32) 100%)",
        }}
      />
      {/* Desktop: a directional left→center scrim, far-left near black. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-10 hidden sm:block"
        style={{
          background:
            "linear-gradient(102deg, rgba(2,3,8,0.9) 0%, rgba(2,3,8,0.6) 27%, rgba(2,3,8,0.22) 49%, transparent 68%)",
        }}
      />
      {/* Bottom scrim under the metric rail (both layouts). */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-[38%]"
        style={{
          background: "linear-gradient(to top, rgba(2,3,8,0.82) 0%, rgba(2,3,8,0.24) 58%, transparent 100%)",
        }}
      />

      {/* Layer 2 — readable foreground. */}
      <main className="relative z-20 flex h-svh w-full flex-col px-[clamp(1.25rem,5vw,4.5rem)] py-[clamp(1.5rem,4.5vh,3rem)] text-white">
        <header className="flex items-start justify-between">
          <span className="text-[10px] uppercase tracking-[0.34em] text-white/40">
            Atmospheric Field
          </span>
          <StatusPill status={status} />
        </header>

        <div className="flex flex-1 items-center">
          <div className="w-full lg:w-[40%] lg:max-w-[560px]">
            <WeatherTextPanel readout={readout} clock={clock} accent={target.accent} />
          </div>
        </div>

        <WeatherMetricRail readout={readout} />
      </main>
    </>
  );
}
