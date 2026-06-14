"use client";

import { motion } from "framer-motion";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { hourLabel } from "@/lib/format";
import type { HourlyForecast as HourlyForecastData } from "@/lib/types";
import WeatherIcon from "./WeatherIcon";

interface Props {
  hourly: HourlyForecastData[];
  isNightAt: (iso: string) => boolean;
}

interface ChartPoint {
  label: string;
  temp: number;
  pop: number;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: ChartPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="glass-deep rounded-xl px-3.5 py-2.5 text-xs">
      <p className="mb-1 font-semibold text-slate-200">{point.label}</p>
      <p className="text-violet-300">기온 {Math.round(point.temp)}°</p>
      <p className="text-sky-300">강수 확률 {Math.round(point.pop)}%</p>
    </div>
  );
}

export default function HourlyForecast({ hourly, isNightAt }: Props) {
  const points: ChartPoint[] = hourly.map((h) => ({
    label: hourLabel(h.time),
    temp: h.temperature,
    pop: h.precipitationProbability ?? 0,
  }));

  return (
    <div className="glass rounded-3xl p-6">
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              interval={2}
            />
            <YAxis yAxisId="temp" hide domain={["dataMin - 2", "dataMax + 2"]} />
            <YAxis yAxisId="pop" hide domain={[0, 100]} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(167,139,250,0.3)" }} />
            <Bar
              yAxisId="pop"
              dataKey="pop"
              fill="rgba(96,165,250,0.28)"
              radius={[3, 3, 0, 0]}
              barSize={7}
              isAnimationActive={false}
            />
            <Area
              yAxisId="temp"
              type="monotone"
              dataKey="temp"
              stroke="#a78bfa"
              strokeWidth={2}
              fill="url(#tempGradient)"
              dot={false}
              activeDot={{ r: 4, fill: "#c4b5fd", stroke: "transparent" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="scroll-thin mt-5 flex gap-2.5 overflow-x-auto pb-2">
        {hourly.map((h, i) => {
          const pop = h.precipitationProbability;
          return (
            <motion.div
              key={h.time}
              className={`flex w-[74px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 ${
                i === 0 ? "bg-white/10 ring-1 ring-violet-400/40" : "bg-white/[0.03]"
              }`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: Math.min(i * 0.03, 0.6) }}
            >
              <span className="text-xs text-slate-400">{i === 0 ? "지금" : hourLabel(h.time)}</span>
              <WeatherIcon
                condition={h.condition}
                night={isNightAt(h.time)}
                className="h-7 w-7 text-slate-200"
              />
              <span className="text-base font-semibold text-slate-100">
                {Math.round(h.temperature)}°
              </span>
              <span className={`text-[11px] ${pop ? "text-sky-300" : "text-slate-600"}`}>
                {pop !== null ? `${Math.round(pop)}%` : "—"}
              </span>
              {h.windSpeed !== null && (
                <span className="text-[10px] text-slate-500">{Math.round(h.windSpeed)}km/h</span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
