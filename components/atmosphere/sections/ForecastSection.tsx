"use client";

import { dayLabel, makeIsNightAt } from "@/lib/format";
import GlassPanel from "../glass/GlassPanel";
import WeatherGlyph from "../glass/WeatherGlyph";
import { MetricLabel } from "../EtchedType";
import { ScrollReveal } from "../descentMotion";
import { useWeatherField } from "../WeatherFieldContext";
import { SectionHeading, SkySection } from "./SectionParts";

/**
 * Section 3 — Forecast. The shared sky snapshot already carries the next 24h of
 * hourly and ~7 days of daily forecast, so this reads from context with no extra
 * fetch. Two matte instruments: a horizontally-scrollable hourly strip and a
 * 7-day row. (The celestial dial + wind trend live in Section 4, Sun & Sky.)
 */

const KST = "Asia/Seoul";
const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: KST, hour: "numeric", hour12: true });

export default function ForecastSection() {
  const { snapshot, readout } = useWeatherField();

  const hourly = snapshot?.hourly ?? [];
  const daily = (snapshot?.daily ?? []).slice(0, 7);
  // Per-hour day/night for the icon face, from the daily sun times (fixed-hour
  // fallback inside makeIsNightAt when a provider has none).
  const isNightAt = makeIsNightAt(snapshot?.daily ?? []);

  return (
    <SkySection>
      <SectionHeading index="03" en="Forecast" ko="예보" />

      <div className="flex flex-col gap-4 sm:gap-5">
        {/* Hourly — a horizontally-scrollable strip of the next 24h. */}
        <ScrollReveal amount={0.15}>
          <GlassPanel className="px-4 py-4 sm:px-5 sm:py-5">
            <MetricLabel>Next 24 Hours · 시간별</MetricLabel>
            {hourly.length > 0 ? (
              <div
                className="scroll-thin mt-4 flex gap-1 overflow-x-auto rounded-lg pb-1 outline-none focus-visible:ring-1 focus-visible:ring-white/30"
                tabIndex={0}
                role="group"
                aria-label="시간별 예보 — 좌우 화살표로 스크롤"
              >
                {hourly.slice(0, 24).map((h, i) => (
                  <div
                    key={h.time}
                    className="flex min-w-[3.4rem] flex-col items-center gap-2.5 px-1.5 py-1"
                  >
                    <span className="font-mono text-[10px] tracking-[0.1em] text-white/60">
                      {i === 0 ? "지금" : hourFmt.format(new Date(h.time))}
                    </span>
                    {/* '지금' mirrors the live readout (KMA-preferred current condition,
                        same source the on-screen video uses) so it never diverges from
                        what's playing; later hours stay on the Open-Meteo hourly series. */}
                    <WeatherGlyph
                      condition={i === 0 ? readout.condition : h.condition}
                      night={isNightAt(h.time)}
                      size={22}
                      className="text-white/90"
                    />
                    <span className="font-sans text-base font-light tabular-nums text-white/95">
                      {Math.round(h.temperature)}°
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.2em] text-white/45">
                시간별 예보 없음
              </p>
            )}
          </GlassPanel>
        </ScrollReveal>

        {/* Daily — a 7-day row, each day its own panel tile. */}
        {daily.length > 0 && (
          <ScrollReveal amount={0.15} delay={0.05}>
            <MetricLabel className="mb-3 px-1">7-Day · 주간</MetricLabel>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 sm:gap-3">
              {daily.map((d) => (
                <GlassPanel key={d.date} radius="rounded-[16px]" className="px-2 py-3.5">
                  <div className="flex flex-col items-center gap-2.5">
                    <span className="font-mono text-[10px] tracking-[0.08em] text-white/65">
                      {dayLabel(d.date)}
                    </span>
                    <WeatherGlyph condition={d.condition} size={22} className="text-white/90" />
                    <span className="flex items-baseline gap-1.5 font-sans tabular-nums">
                      <span className="text-base font-light text-white/95">{Math.round(d.temperatureMax)}°</span>
                      <span className="text-xs font-light text-white/55">{Math.round(d.temperatureMin)}°</span>
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
