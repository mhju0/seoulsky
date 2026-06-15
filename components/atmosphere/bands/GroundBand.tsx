"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatClock, formatHeaderDate } from "@/lib/format";
import type { ProviderAvailability, WeatherIntelligence } from "@/lib/types";
import CinematicDiagnostics from "@/components/CinematicDiagnostics";
import ConfidencePanel from "@/components/ConfidencePanel";
import ProviderComparison from "@/components/ProviderComparison";
import { HairlineRule, MetricLabel } from "../EtchedType";
import { ScrollReveal } from "../descentMotion";
import { useWeatherField } from "../WeatherFieldContext";
import { DailyHorizon, HourlyRidge } from "./ForecastHorizon";

/**
 * Band 5 — Ground Station. The data deck where the descent lands: cross-provider
 * confidence and comparison, the forecast (rendered as the horizon in T4.2), and
 * the cinematic-engine diagnostics — all as quiet etched readouts, no cards. It
 * owns the one heavier /api/weather intelligence fetch (the live sky snapshot is
 * shared from context, never re-fetched). The lean Seoul snapshot already covers
 * current conditions, air and radar (bands 1–4), so this band stays focused on
 * provenance + the forecast horizon.
 */

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const DOT: Record<ProviderAvailability, string> = {
  ok: "bg-emerald-300",
  "needs-config": "bg-amber-300",
  error: "bg-rose-300",
  unavailable: "bg-slate-500",
};

/** An etched deck section: a small-caps heading + a hairline, then content. */
function DeckSection({
  label,
  sub,
  delay = 0,
  children,
}: {
  label: string;
  sub?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <ScrollReveal delay={delay} amount={0.15}>
      <HairlineRule className="mb-6" />
      <div className="mb-8 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <MetricLabel tone="muted">{label}</MetricLabel>
        {sub && <span className="font-mono text-[10px] tracking-[0.2em] text-white/35">{sub}</span>}
      </div>
      {children}
    </ScrollReveal>
  );
}

export default function GroundBand() {
  const { snapshot, clock } = useWeatherField();
  const [data, setData] = useState<WeatherIntelligence | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const anyLive = data?.providers.some((p) => p.status.availability === "ok") ?? false;
  const primary = data?.providers.find((p) => p.id === data.primaryId) ?? null;

  return (
    <>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-[clamp(1.25rem,5vw,4.5rem)] pb-10 pt-[clamp(3rem,9vh,6rem)] text-white">
      {/* Etched header — provenance, time, source status. */}
      <ScrollReveal amount={0.1}>
        <Link
          href="/"
          className="font-mono text-[11px] tracking-[0.16em] text-white/40 transition hover:text-white/70"
        >
          ← 시네마틱 모드 (Esc) · 상공 (A)
        </Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <MetricLabel tone="muted">Ground Station · 지상 관측소</MetricLabel>
            <p className="mt-2 font-sans text-[clamp(1.6rem,4vw,2.4rem)] font-light text-white/95">
              서울 기상 인텔리전스
            </p>
            <p className="mt-1 font-mono text-xs tracking-[0.12em] text-white/45">
              {clock ? formatHeaderDate(clock) : " "} · 대한민국 서울
            </p>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="font-sans text-3xl font-light tabular-nums text-white/90 [text-shadow:0_1px_14px_rgba(0,0,0,0.5)]">
                {clock ? formatClock(clock) : "--:--:--"}
              </p>
              <p className="mt-0.5 font-mono text-[10px] tracking-[0.3em] text-white/40">SEOUL · KST</p>
            </div>
            <button
              onClick={load}
              disabled={refreshing}
              className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/45 transition hover:text-white/80 disabled:opacity-50"
            >
              {refreshing ? "동기화 중" : "↻ 새로고침"}
            </button>
          </div>
        </div>

        {data && (
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {anyLive && (
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300">LIVE</span>
              </span>
            )}
            {data.providers.map((p) => (
              <span key={p.id} className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${DOT[p.status.availability]}`} />
                <span className="font-mono text-[10px] tracking-[0.14em] text-white/55">{p.status.name}</span>
              </span>
            ))}
          </div>
        )}
      </ScrollReveal>

      {!data && !failed && (
        <div className="flex items-center gap-3 py-10">
          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white/70" />
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-white/50">
            서울 상공 데이터 수신 중
          </span>
        </div>
      )}

      {!data && failed && (
        <div className="flex flex-col items-start gap-3 py-10">
          <p className="font-sans text-lg font-light text-white/85">데이터 수신 실패</p>
          <p className="max-w-md text-sm leading-relaxed text-white/50">
            기상 소스에 연결할 수 없습니다. 네트워크 상태를 확인한 뒤 다시 시도하세요.
          </p>
          <button
            onClick={load}
            className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-white/70 transition hover:text-white"
          >
            ↻ 다시 시도
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Real KMA warnings, if any — preserved as an etched line (never fabricated). */}
          {data.warnings.length > 0 && (
            <ScrollReveal amount={0.2} className="flex flex-col gap-2">
              <MetricLabel className="text-amber-300/80">기상 특보</MetricLabel>
              {data.warnings.map((w) => (
                <p key={`${w.type}-${w.area}-${w.issuedAt ?? ""}`} className="text-sm text-amber-100/90">
                  {w.headline}
                  <span className="ml-2 font-mono text-[11px] text-amber-200/50">{w.area}</span>
                </p>
              ))}
            </ScrollReveal>
          )}

          <DeckSection label="신뢰도 분석" sub="소스 간 교차 검증">
            <ConfidencePanel confidence={data.confidence} comparison={data.comparison} />
          </DeckSection>

          <DeckSection label="소스 비교" sub="제공자별 현재 예보" delay={0.05}>
            <ProviderComparison snapshots={data.providers} comparison={data.comparison} />
          </DeckSection>

          {/* Forecast — the hourly ridge sits in the deck; the daily ridge is the
              horizon, rendered full-bleed at the very bottom below. */}
          {primary && primary.hourly.length > 0 && (
            <DeckSection label="시간별 예보" sub="향후 24시간" delay={0.1}>
              <HourlyRidge hourly={primary.hourly} />
            </DeckSection>
          )}

          <DeckSection label="시네마틱 엔진" sub="영상 플레이트 · 렌더 모드 · 폴백" delay={0.1}>
            <CinematicDiagnostics sky={snapshot} />
          </DeckSection>

          <footer className="pt-4 text-center font-mono text-[11px] leading-relaxed tracking-[0.1em] text-white/35">
            SeoulSky — 서울 전용 기상 커맨드 센터 · 데이터: Open-Meteo · MET Norway
            {" / "}선택: 기상청(KMA) — 비공식 개인 프로젝트
          </footer>
        </>
      )}
      </div>

      {/* The horizon — the daily ridge sits full-bleed at the very bottom of the
          page, reading as the field's horizon line. */}
      {primary && primary.daily.length > 0 && (
        <div className="w-full px-1 pb-[clamp(1.5rem,5vh,3.5rem)]">
          <DailyHorizon daily={primary.daily} />
        </div>
      )}
    </>
  );
}
