"use client";

import { motion } from "framer-motion";
import { koreanDailySummary } from "@/lib/conditions";
import { dayLabel } from "@/lib/format";
import type { DailyForecast as DailyForecastData } from "@/lib/types";
import WeatherIcon from "./WeatherIcon";

interface Props {
  daily: DailyForecastData[];
}

export default function DailyForecast({ daily }: Props) {
  const weekMin = Math.min(...daily.map((d) => d.temperatureMin));
  const weekMax = Math.max(...daily.map((d) => d.temperatureMax));
  const range = Math.max(weekMax - weekMin, 1);

  return (
    <div className="glass rounded-3xl p-6">
      <div className="flex flex-col divide-y divide-white/5">
        {daily.map((d, i) => {
          const left = ((d.temperatureMin - weekMin) / range) * 100;
          const width = ((d.temperatureMax - d.temperatureMin) / range) * 100;
          return (
            <motion.div
              key={d.date}
              className="grid grid-cols-[3.5rem_2rem_1fr_auto] items-center gap-3 py-3 sm:grid-cols-[4rem_2.5rem_minmax(8rem,1fr)_minmax(10rem,14rem)]"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
            >
              <span
                className={`text-sm ${i === 0 ? "font-semibold text-violet-300" : "text-slate-300"}`}
              >
                {dayLabel(d.date)}
              </span>
              <WeatherIcon condition={d.condition} className="h-6 w-6 text-slate-200" />
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-300">
                  {koreanDailySummary(d.condition, d.precipitationProbability)}
                </p>
                {d.precipitationProbability !== null && d.precipitationProbability > 0 && (
                  <p className="text-xs text-sky-300/80">
                    강수 확률 {Math.round(d.precipitationProbability)}%
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-8 text-right text-sm text-sky-200">
                  {Math.round(d.temperatureMin)}°
                </span>
                <div className="relative h-1.5 w-full min-w-14 flex-1 rounded-full bg-white/10">
                  <div
                    className="absolute h-full rounded-full bg-gradient-to-r from-sky-400 via-violet-400 to-amber-300"
                    style={{ left: `${left}%`, width: `${Math.max(width, 4)}%` }}
                  />
                </div>
                <span className="w-8 text-sm font-semibold text-amber-200">
                  {Math.round(d.temperatureMax)}°
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
