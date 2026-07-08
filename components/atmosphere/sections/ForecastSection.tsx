"use client";

import { dayLabel, makeIsNightAt } from "@/lib/format";
import { buildForecastBlocks } from "@/lib/forecast/blocks";
import type { WeatherCondition } from "@/lib/types";
import GlassPanel from "../glass/GlassPanel";
import WeatherGlyph from "../glass/WeatherGlyph";
import { MetricLabel } from "../EtchedType";
import { ScrollReveal } from "../descentMotion";
import { useWeatherField } from "../WeatherFieldContext";
import { SectionHeading, SkySection } from "./SectionParts";

/**
 * Section 4 — Forecast. A full-screen, rain-forward read of the hours just ahead
 * and the week ahead. The shared sky snapshot already carries the hourly + daily
 * series (incl. Open-Meteo precip probability), so this reads from context with no
 * extra fetch. Two scaled-up blocks: a glanceable time-of-day strip — the next
 * ~15 hours folded into five wide, no-scroll blocks (지금 → 새벽/아침/…) by
 * {@link buildForecastBlocks} — and the 7-day row as seven equal full-width cards,
 * each carrying 강수확률 (POP) alongside the condition + temperatures.
 *
 * (The former Sun & Sky section — celestial dial + wind trend — has been removed;
 * Ground Station is now Section 5, with Radar inserted as Section 3.)
 */

/** Probability → indicator tint, graduating from a faint sky to a saturated
 *  blue so heavier rain chances read louder across the strip and the week row. */
function popTint(pop: number | null): string {
  if (pop == null) return "bg-white/15";
  if (pop < 20) return "bg-sky-300/45";
  if (pop < 50) return "bg-sky-400/75";
  return "bg-blue-400/90";
}

const clampPct = (pop: number | null) => (pop == null ? 0 : Math.max(0, Math.min(100, pop)));

/**
 * Presentation-only reconciliation of the forecast glyph with its POP. Open-Meteo's
 * `weather_code` is the modal/most-likely sky state while POP is a probability (a max
 * aggregate for the daily row), so a dry code can legitimately pair with a high rain
 * chance — leaving a ☀️ glyph beside "86%". When the chance is at least even (≥50%)
 * we upgrade a *dry* face (clear / partly-cloudy only) to the existing "rain" glyph so
 * the icon no longer contradicts the number. All other conditions — cloudy/overcast
 * (already non-sunny) and every precip/snow/thunder face — pass through untouched, and
 * no POP number, bar, or text is changed. This stays inside the forecast cards: it does
 * not touch WeatherGlyph, fusion, or the KMA-anchored live scene. */
function glyphCondition(condition: WeatherCondition, pop: number | null): WeatherCondition {
  if (pop != null && pop >= 50 && (condition === "clear" || condition === "partly-cloudy")) {
    return "rain";
  }
  return condition;
}

/** Swap here if you want "High/Low", "최고/최저", etc. */
const TEMP_LABEL = { high: "H", low: "L" } as const;

export default function ForecastSection() {
  const { snapshot, readout } = useWeatherField();

  const blocks = buildForecastBlocks(snapshot?.hourly ?? []);
  const daily = (snapshot?.daily ?? []).slice(0, 7);
  // Per-hour day/night for the icon face, from the daily sun times (fixed-hour
  // fallback inside makeIsNightAt when a provider has none).
  const isNightAt = makeIsNightAt(snapshot?.daily ?? []);

  return (
    <SkySection compact>
      <SectionHeading index="04" en="Forecast" ko="앞으로의 날씨" compact />

      <div className="mx-auto flex w-full max-w-[80rem] flex-1 flex-col justify-center gap-7 sm:gap-8">
        {/* Time-of-day — the next ~15h folded into five wide, glanceable blocks
            (지금 → 새벽/아침/…) inside one frosted capsule. A 5-col grid, so every
            block stays visible at any width with no horizontal scroll. The period
            label is the glance anchor; each block carries hi/lo + a precip bar. */}
        <ScrollReveal amount={0.12}>
          <GlassPanel className="px-4 py-5 sm:px-7 sm:py-6">
            <MetricLabel tone="bright">Next Hours · 시간대별 · 강수확률</MetricLabel>
            {blocks.length > 0 ? (
              <div
                className="mt-5 grid grid-cols-5 gap-x-2 sm:gap-x-4"
                role="group"
                aria-label="시간대별 예보 — 기온 및 강수확률"
              >
                {blocks.map((b, i) => {
                  const pct = clampPct(b.precipMax);
                  return (
                    <div key={b.representativeTime} className="flex flex-col items-center gap-2 text-center sm:gap-2.5">
                      {/* Period label — the largest, most prominent glance target. */}
                      <span className="font-sans font-normal leading-none tracking-tight text-white text-[clamp(1.15rem,1.6vw,1.5rem)]">
                        {b.label}
                      </span>
                      <span className="font-mono text-[11px] tracking-[0.04em] text-white">
                        {b.rangeLabel}
                      </span>
                      {/* '지금' mirrors the live readout (KMA-preferred current condition,
                          the same source the on-screen scene uses) so it never diverges
                          from what's showing; later blocks use their representative hour. */}
                      <WeatherGlyph
                        condition={i === 0 ? readout.condition : glyphCondition(b.condition, b.precipMax)}
                        night={isNightAt(b.representativeTime)}
                        size={32}
                        className="text-white"
                      />
                      {/* hi/lo — the 7-day card's treatment, scaled up. ↑↓ glyphs
                          at 0.6em inherit the parent's adaptive ink so they stay
                          legible over both bright and dark backdrops. */}
                      <span className="flex flex-col items-center gap-0.5 font-sans tabular-nums sm:flex-row sm:items-baseline sm:gap-1.5">
                        <span className="font-light text-white text-base sm:text-[clamp(1.4rem,1.9vw,1.8rem)]">
                          <span className="text-[0.6em]">{TEMP_LABEL.high}</span>{b.tempHigh}°
                        </span>
                        <span className="font-light text-white text-xs sm:text-[clamp(1rem,1.3vw,1.25rem)]">
                          <span className="text-[0.6em]">{TEMP_LABEL.low}</span>{b.tempLow}°
                        </span>
                      </span>
                      {/* Precip-probability indicator: % over a bar scaled by POP. */}
                      <div className="mt-0.5 flex w-full flex-col items-center gap-1">
                        <span className="font-mono text-[12px] tabular-nums text-white">
                          {b.precipMax == null ? "—" : `${Math.round(pct)}%`}
                        </span>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10" aria-hidden>
                          <div className={`h-full rounded-full ${popTint(b.precipMax)}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-6 font-mono text-[12px] uppercase tracking-[0.2em] text-white">
                시간별 예보 없음
              </p>
            )}
          </GlassPanel>
        </ScrollReveal>

        {/* Daily — seven equal full-width cards, each adding 강수확률 to hi/lo + icon. */}
        {daily.length > 0 && (
          <ScrollReveal amount={0.12} delay={0.06}>
            <MetricLabel tone="bright" className="mb-3 px-1">7-Day · 주간 · 강수확률</MetricLabel>
            <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7 sm:gap-3">
              {daily.map((d) => (
                <GlassPanel key={d.date} className="px-2 py-4 sm:px-3 sm:py-4">
                  <div className="flex flex-col items-center gap-2.5">
                    <span className="font-mono text-[12px] tracking-[0.08em] text-white">
                      {dayLabel(d.date)}
                    </span>
                    <WeatherGlyph condition={glyphCondition(d.condition, d.precipitationProbability)} size={30} className="text-white" />
                    <span className="flex flex-col items-center gap-0.5 font-sans tabular-nums sm:flex-row sm:items-baseline sm:gap-1.5">
                      <span className="text-base font-light text-white sm:text-xl"><span className="text-[0.6em]">{TEMP_LABEL.high}</span>{Math.round(d.temperatureMax)}°</span>
                      <span className="text-xs font-light text-white sm:text-base"><span className="text-[0.6em]">{TEMP_LABEL.low}</span>{Math.round(d.temperatureMin)}°</span>
                    </span>
                    <span className="flex items-center gap-1.5 font-mono text-[12px] tabular-nums text-white">
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
