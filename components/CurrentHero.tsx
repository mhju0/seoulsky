"use client";

import { motion } from "framer-motion";
import { CONDITION_LABELS_KO } from "@/lib/conditions";
import { formatKstTime, windDirectionKo } from "@/lib/format";
import type { ProviderSnapshot } from "@/lib/types";
import WeatherIcon from "./WeatherIcon";

interface Props {
  snapshot: ProviderSnapshot;
  rainRisk: number | null;
  isNight: boolean;
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass rounded-2xl px-5 py-4">
      <p className="text-xs tracking-wider text-slate-400">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-slate-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function CurrentHero({ snapshot, rainRisk, isNight }: Props) {
  const cw = snapshot.current;
  if (!cw) return null;
  const today = snapshot.daily[0];

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <span className="glass flex items-center gap-2 rounded-full px-4 py-1.5 text-sm text-slate-200">
            <WeatherIcon condition={cw.condition} night={isNight} className="h-5 w-5 text-violet-300" />
            {CONDITION_LABELS_KO[cw.condition]}
          </span>
          <span className="text-xs text-slate-400">
            {snapshot.status.name} 기준 · {formatKstTime(cw.time)} 관측
          </span>
        </motion.div>

        <motion.p
          className="animate-glow mt-2 bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-[7.5rem] font-extralight leading-none tracking-tighter text-transparent md:text-[10rem]"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.1 }}
        >
          {Math.round(cw.temperature)}°
        </motion.p>

        <motion.div
          className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-300"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          {cw.apparentTemperature !== null && (
            <span>체감 {Math.round(cw.apparentTemperature)}°</span>
          )}
          {today && (
            <span className="text-slate-400">
              최고 <b className="font-semibold text-amber-200">{Math.round(today.temperatureMax)}°</b>
              {" · "}최저{" "}
              <b className="font-semibold text-sky-200">{Math.round(today.temperatureMin)}°</b>
            </span>
          )}
        </motion.div>
      </div>

      <motion.div
        className="grid w-full grid-cols-2 gap-3 lg:w-[380px]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <StatTile
          label="강수 확률"
          value={rainRisk !== null ? `${Math.round(rainRisk)}%` : "—"}
          sub="향후 12시간 최대"
        />
        <StatTile
          label="바람"
          value={cw.windSpeed !== null ? `${Math.round(cw.windSpeed)} km/h` : "—"}
          sub={cw.windDirection !== null ? `${windDirectionKo(cw.windDirection)}풍` : undefined}
        />
        <StatTile label="습도" value={cw.humidity !== null ? `${Math.round(cw.humidity)}%` : "—"} />
        <StatTile
          label="구름량"
          value={cw.cloudCover !== null ? `${Math.round(cw.cloudCover)}%` : "—"}
        />
      </motion.div>
    </div>
  );
}
