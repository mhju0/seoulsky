"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { rainRiskNext12h } from "@/lib/compare";
import { formatClock, formatHeaderDate, makeIsNightAt } from "@/lib/format";
import type { ProviderAvailability, WeatherIntelligence } from "@/lib/types";
import CinematicDiagnostics from "./CinematicDiagnostics";
import ConfidencePanel from "./ConfidencePanel";
import CurrentHero from "./CurrentHero";
import DailyForecast from "./DailyForecast";
import Diagnostics from "./Diagnostics";
import EnvironmentPanel from "./EnvironmentPanel";
import HourlyForecast from "./HourlyForecast";
import ProviderComparison from "./ProviderComparison";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const DOT_COLORS: Record<ProviderAvailability, string> = {
  ok: "bg-emerald-400",
  "needs-config": "bg-amber-400",
  error: "bg-rose-400",
  unavailable: "bg-slate-500",
};

function SectionTitle({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-2.5">
      <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,0.9)]" />
      <h2 className="text-sm font-semibold tracking-[0.2em] text-slate-300">{label}</h2>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}

function Section({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: "easeOut" }}
    >
      {children}
    </motion.section>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-5 w-5 ${spinning ? "animate-spin" : ""}`}
      aria-hidden
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

function LoadingScreen() {
  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-8">
      <div className="relative flex h-40 w-40 items-center justify-center">
        <div className="radar-ring" style={{ "--ring-delay": "0s" } as React.CSSProperties} />
        <div className="radar-ring" style={{ "--ring-delay": "1.1s" } as React.CSSProperties} />
        <div className="radar-ring" style={{ "--ring-delay": "2.2s" } as React.CSSProperties} />
        <div className="radar-sweep opacity-60" />
        <span className="text-xs font-semibold tracking-[0.35em] text-violet-300">SEOULSKY</span>
      </div>
      <div className="text-center">
        <p className="text-lg font-medium text-slate-200">서울 상공 데이터 수신 중</p>
        <p className="mt-1.5 text-sm text-slate-500">기상 소스에 연결하고 있습니다…</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<WeatherIntelligence | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/weather", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as WeatherIntelligence);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
    const id = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    queueMicrotask(tick);
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push("/");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const primary = data?.providers.find((p) => p.id === data.primaryId) ?? null;
  const isNightAt = makeIsNightAt(primary?.daily ?? []);
  const isNight = isNightAt(new Date().toISOString());
  const anyLive = data?.providers.some((p) => p.status.availability === "ok") ?? false;

  return (
    <div className="relative min-h-screen">
      <div
        className="fixed inset-0 z-0"
        style={{
          background: "linear-gradient(180deg, #04060d 0%, #090f1e 55%, #0e1730 100%)",
        }}
        aria-hidden
      />

      {!data && !failed && <LoadingScreen />}

      {!data && failed && (
        <div className="relative z-10 flex min-h-screen items-center justify-center px-5">
          <div className="glass max-w-md rounded-3xl p-10 text-center">
            <p className="text-xl font-semibold text-slate-100">데이터 수신 실패</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              기상 소스에 연결할 수 없습니다. 네트워크 상태를 확인한 뒤 다시 시도하세요.
            </p>
            <button
              onClick={load}
              className="glass mt-6 rounded-full px-6 py-2.5 text-sm font-medium text-violet-200 transition hover:bg-white/10"
            >
              다시 시도
            </button>
          </div>
        </div>
      )}

      {data && (
        <main className="relative z-10 mx-auto flex max-w-6xl flex-col gap-12 px-5 py-10 md:px-8">
          <Section>
            <header className="flex flex-col gap-5">
              <Link
                href="/"
                className="-mb-1 self-start text-xs text-slate-500 transition hover:text-slate-300"
              >
                ← 시네마틱 모드 (Esc)
              </Link>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-[0.4em] text-violet-400">
                    SEOULSKY · 데이터 덱
                  </p>
                  <h1 className="mt-1.5 text-3xl font-bold text-slate-50">서울 기상 인텔리전스</h1>
                  <p className="mt-1 text-sm text-slate-400">
                    {now ? formatHeaderDate(now) : " "} · 대한민국 서울
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-glow-soft text-3xl font-light tabular-nums text-slate-100">
                      {now ? formatClock(now) : "--:--:--"}
                    </p>
                    <p className="mt-0.5 text-[10px] tracking-[0.3em] text-slate-500">
                      SEOUL · KST
                    </p>
                  </div>
                  <button
                    onClick={load}
                    disabled={refreshing}
                    aria-label="새로고침"
                    className="glass rounded-full p-3 text-slate-300 transition hover:bg-white/10 disabled:opacity-60"
                  >
                    <RefreshIcon spinning={refreshing} />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {anyLive && (
                  <span className="glass flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-emerald-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    LIVE
                  </span>
                )}
                {data.providers.map((p) => (
                  <span
                    key={p.id}
                    className="glass flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] text-slate-300"
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${DOT_COLORS[p.status.availability]}`}
                    />
                    {p.status.name}
                  </span>
                ))}
              </div>
            </header>
          </Section>

          <Section delay={0.05}>
            {primary?.current ? (
              <CurrentHero
                snapshot={primary}
                rainRisk={rainRiskNext12h(primary)}
                isNight={isNight}
              />
            ) : (
              <div className="glass rounded-3xl p-10 text-center">
                <p className="text-xl font-semibold text-slate-200">모든 기상 소스 오프라인</p>
                <p className="mt-2 text-sm text-slate-400">
                  네트워크 연결을 확인하세요. 아래 진단 패널에서 소스별 상태를 볼 수 있습니다.
                </p>
              </div>
            )}
          </Section>

          <Section delay={0.1}>
            <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
              <div>
                <SectionTitle label="신뢰도 분석" sub="소스 간 교차 검증" />
                <ConfidencePanel confidence={data.confidence} comparison={data.comparison} />
              </div>
              <div>
                <SectionTitle label="소스 비교" sub="제공자별 현재 예보" />
                <ProviderComparison snapshots={data.providers} comparison={data.comparison} />
              </div>
            </div>
          </Section>

          {primary && primary.hourly.length > 0 && (
            <Section delay={0.15}>
              <SectionTitle label="시간별 예보" sub="향후 24시간" />
              <HourlyForecast hourly={primary.hourly} isNightAt={isNightAt} />
            </Section>
          )}

          {primary && primary.daily.length > 0 && (
            <Section delay={0.2}>
              <SectionTitle label="주간 예보" sub={`${primary.daily.length}일 전망`} />
              <DailyForecast daily={primary.daily} />
            </Section>
          )}

          <Section delay={0.22}>
            <SectionTitle label="환경 인텔리전스" sub="대기질 · 레이더 · 특보" />
            <EnvironmentPanel
              air={data.environment.air}
              radar={data.environment.radar}
              warnings={data.warnings}
              statuses={data.environment.statuses}
            />
          </Section>

          <Section delay={0.25}>
            <SectionTitle label="시스템 진단" sub="설정 · 캐시 · 상태" />
            <Diagnostics data={data} />
          </Section>

          <Section delay={0.28}>
            <SectionTitle label="시네마틱 엔진" sub="영상 플레이트 · 렌더 모드 · 폴백" />
            <CinematicDiagnostics />
          </Section>

          <footer className="pb-6 text-center text-xs text-slate-600">
            SeoulSky — 서울 전용 기상 커맨드 센터 · 데이터: Open-Meteo · MET Norway
            {" / "}선택: 기상청(KMA) — 비공식 개인 프로젝트
          </footer>
        </main>
      )}
    </div>
  );
}
