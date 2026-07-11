"use client";

import { poeticSkyLine } from "@/lib/cinematic/poeticWeatherCopy";
import { computeSunPhase } from "@/lib/cinematic/seoulTime";
import { normalizeWeather } from "@/lib/cinematic/weatherSceneConfig";
import { PoeticLine, Value } from "../EtchedType";
import { Parallax, ScrollReveal } from "../descentMotion";
import { useWeatherClock, useWeatherField } from "../WeatherFieldContext";
import { LiveBadge, SkySection } from "./SectionParts";

/**
 * Section 1 — Arrival. The hero: the live Seoul temperature set large straight over
 * the live view, the city, the condition (Korean), one deterministic Korean poetic line,
 * a pulsing LIVE dot, and the current Seoul time. Big and unhurried — it owns the
 * first viewport over the live scene.
 */

const KST = "Asia/Seoul";
const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  weekday: "short",
  month: "short",
  day: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const round = (n: number | null) => (n == null ? "—" : `${Math.round(n)}`);
const ch = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);

export default function ArrivalSection() {
  const { readout, status, target, snapshot } = useWeatherField();
  const clock = useWeatherClock();

  // Sun phase + poetic line, quantized to the minute so per-second clock ticks
  // don't recompute (the React Compiler memoizes on minuteTick + snapshot).
  const minuteTick = clock ? Math.floor(clock.getTime() / 60000) : 0;
  const sun = computeSunPhase({
    now: minuteTick > 0 ? new Date(minuteTick * 60000) : new Date(),
    sunrise: snapshot?.sun.sunrise,
    sunset: snapshot?.sun.sunset,
    isDayHint: snapshot?.current.isDay,
  });
  const line = poeticSkyLine(sun, normalizeWeather(snapshot?.current, snapshot?.air), snapshot?.radar);

  const accentCss = `rgb(${ch(target.accent[0])}, ${ch(target.accent[1])}, ${ch(target.accent[2])})`;

  return (
    <SkySection center>
      {/* Soft vignette (not glass) behind the hero text — keeps the temperature
          and condition legible over any clip. It scrolls away with the hero, so it
          never dims the gradient content below. */}
      <div aria-hidden className="sky-hero-vignette pointer-events-none absolute inset-0" />
      <ScrollReveal className="sky-on-media relative z-10 flex max-w-[680px] flex-col" amount={0.1}>
        {/* City + live status. */}
        <div className="mb-6 flex items-center gap-3 sm:mb-8">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: accentCss, boxShadow: `0 0 16px ${accentCss}` }}
          />
          <span className="font-sans text-sm font-medium tracking-[0.18em] text-white/85">
            지금, 서울
          </span>
          <span className="text-white/30">·</span>
          <LiveBadge status={status} labelClassName="text-sm" />
        </div>

        {/* The hero: temperature (primary) over the condition (secondary), set
            straight over the live view (no panel), on a hair of parallax so it
            floats as you scroll. Legibility comes from the directional scrim + the
            hero's light ink and text-shadow. */}
        <Parallax className="w-fit" distance={26}>
          <div className="-ml-1">
            <Value size="hero" unit="°">
              {round(readout.temperature)}
            </Value>
          </div>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
            <span className="sky-display text-[clamp(1.6rem,3vw,2.25rem)] leading-snug text-white/95">
              {readout.conditionKo}
            </span>
          </div>
        </Parallax>

        {/* Poetic line — pushed down one additional line-height for breathing
            room; full-white with text-shadow keeps it legible over bright plates. */}
        <PoeticLine className="mt-10 sm:mt-14">{line}</PoeticLine>

        {/* Seoul time — closer to the poetic line, brightened to read clearly. */}
        <div className="mt-8 flex flex-wrap items-center gap-x-5 font-sans text-sm tracking-[0.06em] text-white/90 sm:mt-11">
          <span>{clock ? dateFmt.format(clock) : "—"}</span>
          <span className="tabular-nums text-white/75">{clock ? timeFmt.format(clock) : "--:--"}</span>
          <span className="text-white/50">한국 표준시</span>
        </div>
      </ScrollReveal>
    </SkySection>
  );
}
