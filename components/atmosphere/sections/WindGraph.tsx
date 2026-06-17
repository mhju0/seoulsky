"use client";

import {
  Area,
  AreaChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { inkTriplet } from "@/lib/cinematic/skyPalette";
import type { HourlyForecast } from "@/lib/types";

/**
 * The wind graph — a single minimal Recharts area line of wind speed (m/s) over
 * the next ~24h: a hairline stroke and a gradient fill fading to transparent.
 * The y-axis is FIXED to a Seoul-appropriate ceiling (not auto-scaled) so the
 * area's height reads as absolute wind strength: a calm 1–4 m/s day sits low
 * against the scale instead of filling the panel. Subtle Beaufort bands and a
 * 'windy' line at the fresh-breeze threshold let you read it at a glance.
 * Recharts is heavy, so the forecast section loads this lazily (next/dynamic).
 *
 * Colours follow the sky: axes/hairlines take the day/night ink, and the line
 * deepens to denim on the day's cream panel (powder blue on the night's navy),
 * so the chart stays legible on either surface.
 */

const KST = "Asia/Seoul";
const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: KST, hour: "numeric", hour12: true });

// Fixed vertical scale (m/s). 20 comfortably clears Seoul's usual wind while
// keeping calm days visibly low; round ticks read cleanly on the small panel.
const WIND_MAX = 20;
const WIND_TICKS = [0, 5, 10, 15, 20];
// 'windy' marks Force 5 (fresh breeze), where wind starts to noticeably push.
const WINDY = 8;

// The tooltip is a floating popover, so it stays a dark card on either surface.
const tooltipStyle = {
  background: "rgba(4,6,13,0.92)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  fontSize: 12,
  padding: "6px 10px",
} as const;

export default function WindGraph({ hourly, isDay }: { hourly: HourlyForecast[]; isDay: boolean }) {
  const ink = (a: number) => `rgba(${inkTriplet(isDay)}, ${a})`;
  // Line: powder blue on the navy night panel; a deeper denim on the cream day one.
  const wind = isDay ? "#3f5e93" : "#9ec6ff";
  const coolRgb = isDay ? "63, 94, 147" : "158, 198, 255";
  // Beaufort-derived bands (m/s), faint→stronger so strength reads by background
  // alone; the fresh–strong band is warm. Alphas hold up on cream as well as navy.
  const bands = [
    { y1: 0, y2: 1.5, fill: `rgba(${coolRgb}, 0.04)` }, // calm
    { y1: 1.5, y2: 3.3, fill: `rgba(${coolRgb}, 0.07)` }, // light
    { y1: 3.3, y2: WINDY, fill: `rgba(${coolRgb}, 0.11)` }, // gentle–moderate
    { y1: WINDY, y2: WIND_MAX, fill: isDay ? "rgba(190,120,55,0.13)" : "rgba(255,180,120,0.1)" }, // fresh–strong
  ];
  const windyStroke = isDay ? "rgba(190,120,55,0.6)" : "rgba(255,180,120,0.5)";
  const windyLabel = isDay ? "rgba(170,105,45,0.9)" : "rgba(255,200,150,0.75)";

  const data = hourly.slice(0, 24).map((h, i) => ({
    label: i === 0 ? "지금" : hourFmt.format(new Date(h.time)),
    wind: h.windSpeed == null ? null : Math.round((h.windSpeed / 3.6) * 10) / 10,
  }));
  if (!data.some((d) => d.wind != null)) return null;

  return (
    <div className="h-full min-h-[150px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 6, bottom: 0, left: 6 }}>
          <defs>
            <linearGradient id="windFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={wind} stopOpacity={0.26} />
              <stop offset="100%" stopColor={wind} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Beaufort bands sit behind the line so wind strength reads from the
              background; render before <Area> so the fill paints on top. */}
          {bands.map((b) => (
            <ReferenceArea key={b.y1} y1={b.y1} y2={b.y2} fill={b.fill} strokeWidth={0} />
          ))}
          <XAxis
            dataKey="label"
            interval={3}
            tickLine={false}
            axisLine={false}
            tick={{ fill: ink(0.5), fontSize: 10 }}
            dy={4}
          />
          <YAxis
            domain={[0, WIND_MAX]}
            ticks={WIND_TICKS}
            width={26}
            tickLine={false}
            axisLine={false}
            tick={{ fill: ink(0.5), fontSize: 10 }}
          />
          <ReferenceLine
            y={WINDY}
            stroke={windyStroke}
            strokeDasharray="3 3"
            strokeWidth={1}
            label={{
              value: "windy",
              position: "insideTopRight",
              fill: windyLabel,
              fontSize: 9,
            }}
          />
          <Tooltip
            cursor={{ stroke: ink(0.28), strokeWidth: 1 }}
            contentStyle={tooltipStyle}
            labelStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 10 }}
            itemStyle={{ color: "rgba(255,255,255,0.92)" }}
            formatter={(value) => [`${Number(value).toFixed(1)} m/s`, "바람"]}
          />
          <Area
            type="monotone"
            dataKey="wind"
            name="바람"
            stroke={wind}
            strokeWidth={1.4}
            fill="url(#windFill)"
            connectNulls
            dot={false}
            activeDot={{ r: 3, fill: wind }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
