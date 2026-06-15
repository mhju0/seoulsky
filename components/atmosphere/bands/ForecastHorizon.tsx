"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DailyForecast, HourlyForecast } from "@/lib/types";

/**
 * Forecast as landscape. Two minimal Recharts area charts — no gridlines, hairline
 * strokes, gradient fills fading to transparent. The hourly ridge sits inside the
 * data deck; the daily ridge is rendered full-bleed at the very bottom of the page
 * so it reads as the field's horizon line (data becomes landscape).
 */

const KST = "Asia/Seoul";
const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: KST, hour: "numeric", hour12: true });
const dayFmt = new Intl.DateTimeFormat("ko-KR", { timeZone: KST, weekday: "short" });

const TEMP = "#ffb37a"; // warm horizon line
const POP = "#7fb4ff"; // cool precipitation line

const tooltipStyle = {
  background: "rgba(4,6,13,0.88)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 4,
  fontSize: 12,
  padding: "6px 10px",
} as const;

/** Next ~24h: temperature ridge + a fainter precipitation-probability area. */
export function HourlyRidge({ hourly }: { hourly: HourlyForecast[] }) {
  if (hourly.length === 0) return null;
  const data = hourly.slice(0, 24).map((h, i) => ({
    label: i === 0 ? "지금" : hourFmt.format(new Date(h.time)),
    temp: Math.round(h.temperature),
    pop: h.precipitationProbability ?? 0,
  }));

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="hourlyTemp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TEMP} stopOpacity={0.3} />
              <stop offset="100%" stopColor={TEMP} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="hourlyPop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={POP} stopOpacity={0.18} />
              <stop offset="100%" stopColor={POP} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            interval={3}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }}
            dy={4}
          />
          <YAxis yAxisId="temp" hide domain={["dataMin - 2", "dataMax + 2"]} />
          <YAxis yAxisId="pop" hide domain={[0, 100]} />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }}
            contentStyle={tooltipStyle}
            labelStyle={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}
            formatter={(value, name) => [
              `${Math.round(Number(value))}${name === "강수확률" ? "%" : "°"}`,
              name,
            ]}
          />
          <Area
            yAxisId="pop"
            type="monotone"
            dataKey="pop"
            name="강수확률"
            stroke={POP}
            strokeWidth={1}
            strokeOpacity={0.5}
            fill="url(#hourlyPop)"
            dot={false}
            activeDot={{ r: 2.5, fill: POP }}
          />
          <Area
            yAxisId="temp"
            type="monotone"
            dataKey="temp"
            name="기온"
            stroke={TEMP}
            strokeWidth={1.5}
            fill="url(#hourlyTemp)"
            dot={false}
            activeDot={{ r: 3, fill: TEMP }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * The daily ridge — full-bleed at the bottom of the page. The high-temperature
 * line is the horizon; its gradient fill fades down into the field below it.
 */
export function DailyHorizon({ daily }: { daily: DailyForecast[] }) {
  if (daily.length === 0) return null;
  const data = daily.map((d, i) => ({
    label: i === 0 ? "오늘" : dayFmt.format(new Date(`${d.date}T12:00:00+09:00`)),
    max: Math.round(d.temperatureMax),
    min: Math.round(d.temperatureMin),
  }));

  return (
    <div className="relative h-[180px] w-full" aria-label="주간 기온 능선">
      <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.3em] text-white/35">
        주간 예보 · {daily.length}일
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 28, right: 0, bottom: 22, left: 0 }}>
          <defs>
            <linearGradient id="dailyRidge" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TEMP} stopOpacity={0.28} />
              <stop offset="100%" stopColor={TEMP} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            interval={0}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 10 }}
            dy={6}
          />
          <YAxis hide domain={["dataMin - 3", "dataMax + 3"]} />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }}
            contentStyle={tooltipStyle}
            labelStyle={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}
            formatter={(value, name) => [`${Math.round(Number(value))}°`, name === "max" ? "최고" : "최저"]}
          />
          <Area
            type="monotone"
            dataKey="min"
            name="min"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth={1}
            fill="none"
            dot={false}
            activeDot={{ r: 2.5, fill: "rgba(255,255,255,0.6)" }}
          />
          <Area
            type="monotone"
            dataKey="max"
            name="max"
            stroke={TEMP}
            strokeWidth={1.5}
            fill="url(#dailyRidge)"
            dot={false}
            activeDot={{ r: 3, fill: TEMP }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
