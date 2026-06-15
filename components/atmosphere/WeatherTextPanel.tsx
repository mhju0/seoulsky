"use client";

import {
  conditionLabelEn,
  type AtmosphereReadout,
  type RGB,
} from "@/lib/atmosphere/weatherVisualConfig";

/**
 * The primary information block, anchored bottom-left over a dark scrim: an
 * unmissable temperature, the condition, the felt temperature, and the Seoul
 * date/time. Warm near-white at high opacity — the priority is instant
 * readability, never decoration.
 */

const KST = "Asia/Seoul";
const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: KST,
  weekday: "short",
  month: "long",
  day: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: KST,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const ch = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);
const round = (n: number | null) => (n == null ? "—" : `${Math.round(n)}`);

export default function WeatherTextPanel({
  readout,
  clock,
  accent,
}: {
  readout: AtmosphereReadout;
  clock: Date | null;
  accent: RGB;
}) {
  const accentCss = `rgb(${ch(accent[0])}, ${ch(accent[1])}, ${ch(accent[2])})`;

  return (
    <div className="max-w-[min(92vw,640px)]">
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: accentCss, boxShadow: `0 0 16px ${accentCss}` }}
        />
        <span className="text-[11px] font-medium uppercase tracking-[0.42em] text-white/70">
          Seoul
        </span>
        <span className="text-[10px] tabular-nums tracking-[0.2em] text-white/40">
          37.57°N 126.98°E
        </span>
      </div>

      <div className="mt-3 flex items-start leading-none">
        <span
          className="font-sans font-semibold tabular-nums text-white"
          style={{ fontSize: "clamp(5.5rem, 19vw, 13rem)" }}
        >
          {round(readout.temperature)}
        </span>
        <span
          className="mt-[0.6em] font-sans font-light text-white/80"
          style={{ fontSize: "clamp(2rem, 6vw, 4rem)" }}
        >
          °
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span
          className="font-sans font-medium uppercase tracking-[0.16em] text-white"
          style={{ fontSize: "clamp(1.25rem, 3.4vw, 2.1rem)" }}
        >
          {conditionLabelEn(readout.condition)}
        </span>
        <span className="text-base text-white/55">{readout.conditionKo}</span>
      </div>

      {readout.apparentTemperature != null && (
        <div className="mt-2 text-lg font-light text-white/75">
          Feels like {round(readout.apparentTemperature)}°
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-4 text-sm tracking-wide text-white/60">
        <span>{clock ? dateFmt.format(clock) : "—"}</span>
        <span className="text-white/25">·</span>
        <span className="tabular-nums">{clock ? timeFmt.format(clock) : "--:--"}</span>
      </div>
    </div>
  );
}
