"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useSeoulClock } from "@/hooks/useSeoulClock";
import { CONDITION_LABELS_KO } from "@/lib/conditions";
import { computeSunPhase } from "@/lib/cinematic/seoulTime";
import { poeticSkyLine } from "@/lib/cinematic/poeticWeatherCopy";
import { normalizeWeather } from "@/lib/cinematic/weatherSceneConfig";
import { formatClock, formatHeaderDate, timeAgoKo } from "@/lib/format";
import type { SkySnapshot } from "@/lib/types";
import type { WeatherStatus } from "@/hooks/useLiveSeoulWeather";

/**
 * The only UI over the scene: a movie-title block (SEOULSKY · subtitle · live
 * Seoul clock · temperature · condition · one poetic line) plus whisper-quiet
 * corner notes. No glass cards, no rounded containers — text sits directly on
 * the sky with controlled scrims for legibility. The title block dims after the
 * opening so it never competes with the sky; the clock keeps ticking.
 */

interface Props {
  snapshot: SkySnapshot | null;
  status: WeatherStatus;
  lastUpdatedAt: number | null;
}

const fadeUp = (delay: number, duration = 1.1) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration, delay, ease: "easeOut" as const },
});

export default function MinimalWeatherOverlay({ snapshot, status, lastUpdatedAt }: Props) {
  const now = useSeoulClock();
  const cur = snapshot?.current ?? null;
  const sun = computeSunPhase({
    now: now ?? new Date(),
    sunrise: snapshot?.sun.sunrise,
    sunset: snapshot?.sun.sunset,
    isDayHint: cur?.isDay,
  });
  const weather = normalizeWeather(cur, snapshot?.air ?? null);
  const sourceLabel = snapshot?.observationSource === "kma" ? "기상청" : "OPEN-METEO";
  const warning = snapshot?.warnings?.[0] ?? null;
  const warningCount = snapshot?.warnings?.length ?? 0;

  return (
    <div className="pointer-events-none fixed inset-0 z-20">
      {/* subtle legibility scrims — not cards */}
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/45 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/55 to-transparent" />

      {/* official KMA warning — discreet, only when one actually exists */}
      {warning && (
        <motion.div
          className="absolute left-1/2 top-6 -translate-x-1/2"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 5.6, ease: "easeOut" }}
        >
          <span
            className={`rounded-full border px-3 py-1 text-[10px] tracking-wider backdrop-blur-sm [text-shadow:0_1px_8px_rgba(0,0,0,0.6)] ${
              warning.level === "경보"
                ? "border-red-400/40 bg-red-500/15 text-red-50"
                : "border-amber-300/40 bg-amber-400/15 text-amber-50"
            }`}
          >
            ⚠ 기상특보 · {warning.headline}
            {warningCount > 1 ? ` 외 ${warningCount - 1}건` : ""}
          </span>
        </motion.div>
      )}

      <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
        {/* title block — dims to a quieter presence after the opening */}
        <motion.div
          className="flex flex-col items-center"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0.62 }}
          transition={{ duration: 3, delay: 9, ease: "easeInOut" }}
        >
          <motion.p
            className="text-[12px] font-semibold text-white/90 [text-shadow:0_2px_24px_rgba(0,0,0,0.5)]"
            initial={{ opacity: 0, letterSpacing: "0.9em" }}
            animate={{ opacity: 1, letterSpacing: "0.5em" }}
            transition={{ duration: 2.2, delay: 0.6, ease: "easeOut" }}
          >
            SEOULSKY
          </motion.p>
          <motion.p
            className="mt-3 text-sm font-light text-slate-200/90 [text-shadow:0_2px_18px_rgba(0,0,0,0.55)]"
            {...fadeUp(1.5)}
          >
            서울의 하늘을 비행 중
          </motion.p>
        </motion.div>

        {/* live Seoul date + clock */}
        <motion.div className="mt-9 flex flex-col items-center" {...fadeUp(2.2)}>
          <p className="text-[11px] tracking-[0.32em] text-slate-300/80 [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]">
            서울 · {now ? formatHeaderDate(now) : "—"}
          </p>
          <p className="mt-1 font-light tabular-nums text-2xl text-white/95 [text-shadow:0_2px_20px_rgba(0,0,0,0.6)]">
            {now ? formatClock(now) : "--:--:--"}
          </p>
        </motion.div>

        {/* temperature — appears with the cloud breakthrough */}
        <motion.p
          className="-mt-1 bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-[8.5rem] font-extralight leading-none tracking-tighter text-transparent [filter:drop-shadow(0_6px_40px_rgba(0,0,0,0.5))] md:text-[11rem]"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.6, delay: 4.2, ease: "easeOut" }}
        >
          {cur ? `${Math.round(cur.temperature)}°` : "—"}
        </motion.p>

        {/* condition + poetic line — last to arrive */}
        <motion.p
          className="text-sm tracking-[0.3em] text-slate-200/85 [text-shadow:0_2px_16px_rgba(0,0,0,0.6)]"
          {...fadeUp(5.0)}
        >
          {cur ? CONDITION_LABELS_KO[cur.condition] : status === "error" ? "하늘과 연결 중" : "하늘을 읽는 중"}
        </motion.p>
        <motion.p
          className="mt-3 max-w-md text-base font-light leading-relaxed text-white/90 [text-shadow:0_2px_20px_rgba(0,0,0,0.6)] md:text-lg"
          {...fadeUp(5.4, 1.4)}
        >
          {cur ? poeticSkyLine(sun, weather, snapshot?.radar ?? null) : "서울의 하늘을 불러오는 중입니다"}
        </motion.p>
      </div>

      {/* corner notes */}
      <motion.p
        className="absolute bottom-6 left-7 text-[10px] tracking-wider text-slate-300/70 [text-shadow:0_1px_10px_rgba(0,0,0,0.7)]"
        {...fadeUp(6)}
      >
        {status === "error"
          ? "오프라인 — 마지막 데이터 표시 중"
          : `${timeAgoKo(lastUpdatedAt ? new Date(lastUpdatedAt).toISOString() : null)} 업데이트 · ${sourceLabel}${
              snapshot?.stale ? " · 지연" : ""
            }`}
      </motion.p>

      <motion.div className="absolute bottom-6 right-7" {...fadeUp(6)}>
        <Link
          href="/diagnostics"
          className="pointer-events-auto flex items-center gap-2 text-[10px] tracking-wider text-slate-300/70 transition hover:text-white"
        >
          상세 데이터
          <kbd className="rounded border border-white/20 bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-200">
            D
          </kbd>
        </Link>
      </motion.div>
    </div>
  );
}
