"use client";

import type { WeatherStatus } from "@/hooks/useLiveSeoulWeather";
import { conditionLabelEn } from "@/lib/atmosphere/weatherVisualConfig";
import { poeticSkyLine } from "@/lib/cinematic/poeticWeatherCopy";
import { computeSunPhase } from "@/lib/cinematic/seoulTime";
import { normalizeWeather } from "@/lib/cinematic/weatherSceneConfig";
import { PoeticLine, Value } from "../EtchedType";
import { ScrollReveal } from "../descentMotion";
import { useWeatherField } from "../WeatherFieldContext";

/**
 * Band 1 — Stratosphere / Title. The atmosphere hero: Seoul, the live KST time,
 * the unmissable temperature, the condition word (EN + KO), and one deterministic
 * Korean poetic line from {@link poeticSkyLine}. Pure etched type over the deep
 * upper-sky end of the field — no cards, no rail.
 */

const KST = "Asia/Seoul";
const stampFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: KST,
  weekday: "short",
  month: "2-digit",
  day: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: KST,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const round = (n: number | null) => (n == null ? "—" : `${Math.round(n)}`);
const ch = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);

function StatusLabel({ status }: { status: WeatherStatus }) {
  const label = status === "live" ? "LIVE" : status === "error" ? "CACHED" : "SYNCING";
  const dot = status === "live" ? "bg-emerald-300" : status === "error" ? "bg-amber-300" : "bg-white/60";
  return (
    <span className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${dot} ${status === "loading" ? "animate-pulse" : ""}`} />
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/55">{label}</span>
    </span>
  );
}

export default function TitleBand() {
  const { readout, status, target, clock, snapshot } = useWeatherField();

  // Sun phase changes slowly — quantize to the minute so this is stable across
  // the per-second clock ticks. The React Compiler memoizes `sun`/`line` on these
  // reads (minuteTick + snapshot), so no per-tick recompute; no manual useMemo.
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
    <ScrollReveal className="max-w-[640px]" amount={0.1}>
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: accentCss, boxShadow: `0 0 16px ${accentCss}` }}
        />
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.46em] text-white/75">
          Seoul
        </span>
        <span className="text-white/20">·</span>
        <StatusLabel status={status} />
      </div>

      <div className="-ml-1 mt-3">
        <Value size="hero" unit="°">
          {round(readout.temperature)}
        </Value>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
        <span
          className="font-sans font-semibold uppercase tracking-[0.18em] text-white [text-shadow:0_1px_16px_rgba(0,0,0,0.5)]"
          style={{ fontSize: "clamp(1.3rem, 3.2vw, 2rem)" }}
        >
          {conditionLabelEn(readout.condition)}
        </span>
        <span className="text-base font-light tracking-wide text-white/70">{readout.conditionKo}</span>
      </div>

      <PoeticLine className="mt-7">{line}</PoeticLine>

      <div className="mt-8 flex flex-wrap items-center gap-x-5 font-mono text-sm tracking-[0.08em] text-white/70">
        <span>{clock ? stampFmt.format(clock) : "—"}</span>
        <span className="tabular-nums text-white/55">{clock ? timeFmt.format(clock) : "--:--"}</span>
      </div>
    </ScrollReveal>
  );
}
