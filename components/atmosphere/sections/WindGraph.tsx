"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HourlyForecast } from "@/lib/types";

/**
 * The wind graph — a single minimal Recharts area line of wind speed (m/s) over
 * the next ~24h: a hairline stroke, a gradient fill fading to transparent, no
 * gridlines and no axis lines. Recharts is heavy, so the forecast section loads
 * this lazily (next/dynamic) only when the chart is needed.
 */

const KST = "Asia/Seoul";
const hourFmt = new Intl.DateTimeFormat("en-US", { timeZone: KST, hour: "numeric", hour12: true });
const WIND = "#9ec6ff";

const tooltipStyle = {
  background: "rgba(4,6,13,0.9)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  fontSize: 12,
  padding: "6px 10px",
} as const;

export default function WindGraph({ hourly }: { hourly: HourlyForecast[] }) {
  const data = hourly.slice(0, 24).map((h, i) => ({
    label: i === 0 ? "지금" : hourFmt.format(new Date(h.time)),
    wind: h.windSpeed == null ? null : Math.round((h.windSpeed / 3.6) * 10) / 10,
  }));
  if (!data.some((d) => d.wind != null)) return null;

  return (
    <div className="h-[150px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 6, bottom: 0, left: 6 }}>
          <defs>
            <linearGradient id="windFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={WIND} stopOpacity={0.26} />
              <stop offset="100%" stopColor={WIND} stopOpacity={0} />
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
          <YAxis hide domain={[0, "dataMax + 2"]} />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }}
            contentStyle={tooltipStyle}
            labelStyle={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}
            formatter={(value) => [`${Number(value).toFixed(1)} m/s`, "바람"]}
          />
          <Area
            type="monotone"
            dataKey="wind"
            name="바람"
            stroke={WIND}
            strokeWidth={1.4}
            fill="url(#windFill)"
            connectNulls
            dot={false}
            activeDot={{ r: 3, fill: WIND }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
