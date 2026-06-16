"use client";

import { poeticSkyLine } from "@/lib/cinematic/poeticWeatherCopy";
import { computeSunPhase } from "@/lib/cinematic/seoulTime";
import { normalizeWeather } from "@/lib/cinematic/weatherSceneConfig";
import GlassPanel from "../glass/GlassPanel";
import { PoeticLine, Value } from "../EtchedType";
import { Parallax, ScrollReveal } from "../descentMotion";
import { useWeatherClock, useWeatherField } from "../WeatherFieldContext";
import { LiveBadge, SkySection } from "./SectionParts";

/**
 * Section 1 — Arrival. The hero: the live Seoul temperature in a tall liquid-glass
 * pane, the city, the condition (Korean), one deterministic Korean poetic line,
 * a pulsing LIVE dot, and the current Seoul time. Big and unhurried — it owns the
 * first viewport over the shuffling view.
 */

const KST = "Asia/Seoul";
const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: KST,
  weekday: "short",
  month: "short",
  day: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
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
      <ScrollReveal className="flex max-w-[680px] flex-col" amount={0.1}>
        {/* City + live status. */}
        <div className="mb-8 flex items-center gap-3">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: accentCss, boxShadow: `0 0 16px ${accentCss}` }}
          />
          <span className="font-mono text-sm font-medium uppercase tracking-[0.46em] text-white/85">
            Seoul · 서울
          </span>
          <span className="text-white/30">·</span>
          <LiveBadge status={status} labelClassName="text-sm" />
        </div>

        {/* The hero: temperature + condition in instrument glass, on a hair of
            parallax so it floats a touch over the live view as you scroll. */}
        <Parallax className="w-fit" distance={26}>
          <GlassPanel
            radius="rounded-[34px]"
            className="px-[clamp(1.6rem,4vw,3rem)] py-[clamp(1.4rem,3vw,2.4rem)]"
          >
            <div className="-ml-1">
              <Value size="hero" unit="°">
                {round(readout.temperature)}
              </Value>
            </div>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
              <span className="text-base font-light tracking-wide text-white/75">{readout.conditionKo}</span>
            </div>
          </GlassPanel>
        </Parallax>

        {/* Poetic line — etched, generously led, comfortable over the live view. */}
        <PoeticLine className="mt-9">{line}</PoeticLine>

        {/* Seoul time. */}
        <div className="mt-10 flex flex-wrap items-center gap-x-5 font-mono text-base tracking-[0.08em] text-white/75">
          <span>{clock ? dateFmt.format(clock) : "—"}</span>
          <span className="tabular-nums text-white/60">{clock ? timeFmt.format(clock) : "--:--"}</span>
          <span className="text-white/40">KST</span>
        </div>
      </ScrollReveal>
    </SkySection>
  );
}
