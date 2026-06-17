"use client";

import { dayLabel, makeIsNightAt } from "@/lib/format";
import GlassPanel from "../glass/GlassPanel";
import WeatherGlyph from "../glass/WeatherGlyph";
import { MetricLabel } from "../EtchedType";
import { ScrollReveal } from "../descentMotion";
import { useWeatherField } from "../WeatherFieldContext";
import { SectionHeading, SkySection } from "./SectionParts";

/**
 * Section 3 — Forecast. A full-screen, rain-forward read of the next 24 hours and
 * the week ahead. The shared sky snapshot already carries the hourly + daily
 * series (incl. Open-Meteo precip probability), so this reads from context with no
 * extra fetch. Two scaled-up blocks: the 24-hour strip stretched edge-to-edge so
 * its hours fill the card, and the 7-day row as seven equal full-width cards —
 * each carrying 강수확률 (POP) alongside the condition + temperatures.
 *
 * (The celestial dial + wind trend live in Section 4, Sun & Sky.)
 */

const KST = "Asia/Seoul";
const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: KST, hour: "numeric", hour12: true });

/** Probability → indicator tint, graduating from a faint sky to a saturated
 *  blue so heavier rain chances read louder across the strip and the week row. */
function popTint(pop: number | null): string {
  if (pop == null) return "bg-white/15";
  if (pop < 20) return "bg-sky-300/45";
  if (pop < 50) return "bg-sky-400/75";
  return "bg-blue-400/90";
}

const clampPct = (pop: number | null) => (pop == null ? 0 : Math.max(0, Math.min(100, pop)));

export default function ForecastSection() {
  const { snapshot, readout } = useWeatherField();

  const hourly = (snapshot?.hourly ?? []).slice(0, 24);
  const daily = (snapshot?.daily ?? []).slice(0, 7);
  // Per-hour day/night for the icon face, from the daily sun times (fixed-hour
  // fallback inside makeIsNightAt when a provider has none).
  const isNightAt = makeIsNightAt(snapshot?.daily ?? []);

  return (
    <SkySection>
      <SectionHeading index="03" en="Forecast" ko="예보" />

      <div className="flex flex-1 flex-col justify-center gap-10 sm:gap-14">
        {/* Hourly — the next 24h stretched edge-to-edge: one equal column per hour
            so the last hour lands at the card's right edge. Each column carries a
            precip-probability bar beneath the temperature. */}
        <ScrollReveal amount={0.12}>
          <GlassPanel className="px-6 py-7 sm:px-8 sm:py-8">
            <MetricLabel>Next 24 Hours · 시간별 · 강수확률</MetricLabel>
            {hourly.length > 0 ? (
              <div
                className="mt-6 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-x-1"
                role="group"
                aria-label="시간별 예보 — 24시간 · 기온 및 강수확률"
              >
                {hourly.map((h, i) => {
                  const pct = clampPct(h.precipitationProbability);
                  return (
                    <div key={h.time} className="flex flex-col items-center gap-2.5">
                      <span className="whitespace-nowrap font-mono text-[9px] tracking-[0.04em] text-white/60">
                        {i === 0 ? "지금" : hourFmt.format(new Date(h.time))}
                      </span>
                      {/* '지금' mirrors the live readout (KMA-preferred current condition,
                          same source the on-screen video uses) so it never diverges from
                          what's playing; later hours stay on the Open-Meteo hourly series. */}
                      <WeatherGlyph
                        condition={i === 0 ? readout.condition : h.condition}
                        night={isNightAt(h.time)}
                        size={24}
                        className="text-white/90"
                      />
                      <span className="font-sans text-[15px] font-light tabular-nums text-white/95">
                        {Math.round(h.temperature)}°
                      </span>
                      {/* Precip-probability indicator: % over a bar scaled by POP. */}
                      <div className="mt-0.5 flex w-full flex-col items-center gap-1">
                        <span className="font-mono text-[9px] tabular-nums text-white/55">
                          {h.precipitationProbability == null ? "—" : `${Math.round(pct)}%`}
                        </span>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10" aria-hidden>
                          <div className={`h-full rounded-full ${popTint(h.precipitationProbability)}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-white/45">
                시간별 예보 없음
              </p>
            )}
          </GlassPanel>
        </ScrollReveal>

        {/* Daily — seven equal full-width cards, each adding 강수확률 to hi/lo + icon. */}
        {daily.length > 0 && (
          <ScrollReveal amount={0.12} delay={0.06}>
            <MetricLabel className="mb-4 px-1">7-Day · 주간 · 강수확률</MetricLabel>
            <div className="grid grid-cols-7 gap-3 sm:gap-4">
              {daily.map((d) => (
                <GlassPanel key={d.date} radius="rounded-[20px]" className="px-3 py-6">
                  <div className="flex flex-col items-center gap-3.5">
                    <span className="font-mono text-[11px] tracking-[0.08em] text-white/65">
                      {dayLabel(d.date)}
                    </span>
                    <WeatherGlyph condition={d.condition} size={30} className="text-white/90" />
                    <span className="flex items-baseline gap-1.5 font-sans tabular-nums">
                      <span className="text-lg font-light text-white/95">{Math.round(d.temperatureMax)}°</span>
                      <span className="text-sm font-light text-white/55">{Math.round(d.temperatureMin)}°</span>
                    </span>
                    <span className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-white/60">
                      <span className={`h-1.5 w-1.5 rounded-full ${popTint(d.precipitationProbability)}`} aria-hidden />
                      {d.precipitationProbability == null ? "—" : `${Math.round(d.precipitationProbability)}%`}
                    </span>
                  </div>
                </GlassPanel>
              ))}
            </div>
          </ScrollReveal>
        )}
      </div>
    </SkySection>
  );
}
