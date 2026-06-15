"use client";

import {
  conditionLabelEn,
  type AtmosphereReadout,
  type RGB,
} from "@/lib/atmosphere/weatherVisualConfig";

/**
 * The primary information block of the Atmospheric Color Field: a label, an
 * unmissable temperature, the condition, the felt temperature, and the Seoul
 * date/time — stacked the way the reference reads top-to-bottom. Warm near-white
 * at high opacity over the protected dark zone; the priority is instant
 * readability, never decoration.
 */

const KST = "Asia/Seoul";
const dateParts = new Intl.DateTimeFormat("en-US", {
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

const ch = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);
const round = (n: number | null) => (n == null ? "—" : `${Math.round(n)}`);

/** "Sun 06.15" — weekday + MM.DD, matching the reference's compact stamp. */
function formatStamp(clock: Date): string {
  const p = dateParts.formatToParts(clock);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("weekday")} ${get("month")}.${get("day")}`;
}

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
    <div className="max-w-[min(92vw,560px)]">
      <div className="flex items-center gap-3">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: accentCss, boxShadow: `0 0 16px ${accentCss}` }}
        />
        <span className="text-[11px] font-medium uppercase tracking-[0.46em] text-white/75">
          Seoul
        </span>
      </div>

      <div className="-ml-1 mt-2 flex items-start leading-[0.82]">
        <span
          className="font-sans font-semibold tabular-nums text-white [text-shadow:0_2px_30px_rgba(0,0,0,0.45)]"
          style={{ fontSize: "clamp(5.5rem, 15vw, 12rem)" }}
        >
          {round(readout.temperature)}
        </span>
        <span
          className="mt-[0.18em] font-sans font-light text-white/90"
          style={{ fontSize: "clamp(2rem, 5.4vw, 4rem)" }}
        >
          °
        </span>
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

      {readout.apparentTemperature != null && (
        <div className="mt-2.5 text-lg font-light text-white/80">
          Feels like {round(readout.apparentTemperature)}°
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-5 text-sm tracking-[0.08em] text-white/75">
        <span>{clock ? formatStamp(clock) : "—"}</span>
        <span className="tabular-nums text-white/65">{clock ? timeFmt.format(clock) : "--:--"}</span>
      </div>
    </div>
  );
}
