"use client";

import { useInView } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatClock, formatHeaderDate } from "@/lib/format";
import type { ProviderAvailability, SkyRadar, WeatherIntelligence } from "@/lib/types";
import CinematicDiagnostics from "@/components/CinematicDiagnostics";
import ConfidencePanel from "@/components/ConfidencePanel";
import ProviderComparison from "@/components/ProviderComparison";
import GlassPanel from "../glass/GlassPanel";
import { MetricLabel } from "../EtchedType";
import { ScrollReveal } from "../descentMotion";
import { useWeatherClock, useWeatherField } from "../WeatherFieldContext";
import { SectionHeading, SkySection } from "./SectionParts";

/**
 * Section 4 — Ground Station. The data deck where the scroll lands: cross-provider
 * confidence, the source comparison, the environment sources (air + radar, with
 * the required RainViewer attribution) and the cinematic-engine diagnostics — all
 * re-skinned into the matte reading panels, all the original data/logic preserved.
 *
 * PERF: the heavier /api/weather intelligence fetch is deferred until this final
 * section is approaching (useInView, ~400px early) and refreshed every 5 min; the
 * shared sky snapshot (bands above) is never re-fetched. The Recharts forecast
 * charts now live in Section 3, so nothing heavy mounts here beyond this fetch.
 * The scroll ends here — no footer bar, no nav; the data-source attribution is a
 * quiet line inside the deck.
 */

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const DOT: Record<ProviderAvailability, string> = {
  ok: "bg-emerald-300",
  "needs-config": "bg-amber-300",
  error: "bg-rose-300",
  unavailable: "bg-slate-500",
};

/** Honest one-line radar approach summary — never invents a direction. */
function radarSummary(radar: SkyRadar | null | undefined): string {
  if (!radar) return "레이더 관측 없음";
  if (radar.approaching && radar.fromDirection) return `${radar.fromDirection}쪽에서 비구름 접근 중`;
  if (radar.precipNearby) return "서울 부근에 강수 관측";
  return "접근하는 비구름 없음";
}

/** A deck panel: a small-caps heading (+ sub) over its data block. */
function DeckPanel({
  label,
  sub,
  delay = 0,
  children,
}: {
  label: string;
  sub?: string;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <ScrollReveal delay={delay} amount={0.12}>
      <GlassPanel className="px-5 py-6 sm:px-7 sm:py-7">
        <div className="mb-7 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <MetricLabel tone="muted">{label}</MetricLabel>
          {sub && <span className="font-mono text-[10px] tracking-[0.2em] text-white/45">{sub}</span>}
        </div>
        {children}
      </GlassPanel>
    </ScrollReveal>
  );
}

export default function GroundStationSection() {
  const { snapshot } = useWeatherField();
  const clock = useWeatherClock();
  const [data, setData] = useState<WeatherIntelligence | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Defer the heavy fetch until the ground station is approaching (~400px early
  // so data is ready on arrival). `once` keeps it mounted after first reveal.
  const deckRef = useRef<HTMLDivElement>(null);
  const near = useInView(deckRef, { once: true, margin: "0px 0px 400px 0px" });

  // Guard against a fetch (manual or interval) resolving after unmount — setting
  // state on an unmounted component. Flipped false on teardown (same idea as the
  // `alive` flag in SceneStage's manifest fetch).
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/weather", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as WeatherIntelligence;
      if (!aliveRef.current) return;
      setData(json);
      setFailed(false);
    } catch {
      if (aliveRef.current) setFailed(true);
    } finally {
      if (aliveRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!near) return;
    queueMicrotask(load);
    const id = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [near, load]);

  const anyLive = data?.providers.some((p) => p.status.availability === "ok") ?? false;

  return (
    <SkySection id="ground">
      <SectionHeading index="04" en="Ground Station" ko="지상 관측소" />

      <div ref={deckRef} className="flex flex-col gap-4 sm:gap-5">
        {/* Provenance header. */}
        <ScrollReveal amount={0.1}>
          <GlassPanel className="px-5 py-6 sm:px-7 sm:py-7">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div>
                <MetricLabel tone="muted">서울 기상 인텔리전스</MetricLabel>
                <p className="mt-2 font-sans text-[clamp(1.4rem,3.4vw,2rem)] font-light text-white/95">
                  교차 검증 데이터 덱
                </p>
                <p className="mt-1 font-mono text-xs tracking-[0.12em] text-white/55">
                  {clock ? formatHeaderDate(clock) : " "} · 대한민국 서울
                </p>
              </div>
              <div className="flex items-center gap-5">
                <div className="text-right">
                  <p className="font-sans text-2xl font-light tabular-nums text-white/95">
                    {clock ? formatClock(clock) : "--:--:--"}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] tracking-[0.3em] text-white/50">SEOUL · KST</p>
                </div>
                <button
                  onClick={load}
                  disabled={refreshing}
                  className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/55 transition hover:text-white/90 disabled:opacity-50"
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
                    <span className="font-mono text-[10px] tracking-[0.14em] text-white/65">{p.status.name}</span>
                  </span>
                ))}
              </div>
            )}
          </GlassPanel>
        </ScrollReveal>

        {!near && (
          <p className="py-6 font-mono text-[11px] uppercase tracking-[0.25em] text-white/40">
            ↓ 지상 관측소 데이터를 불러옵니다
          </p>
        )}

        {near && !data && !failed && (
          <div className="flex items-center gap-3 py-6">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white/70" />
            <span className="font-mono text-xs uppercase tracking-[0.25em] text-white/60">
              교차 검증 데이터 수신 중
            </span>
          </div>
        )}

        {!data && failed && (
          <GlassPanel className="px-5 py-6 sm:px-7 sm:py-7">
            <p className="font-sans text-lg font-light text-white/95">데이터 수신 실패</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white/60">
              기상 소스에 연결할 수 없습니다. 네트워크 상태를 확인한 뒤 다시 시도하세요.
            </p>
            <button
              onClick={load}
              className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/80 transition hover:text-white"
            >
              ↻ 다시 시도
            </button>
          </GlassPanel>
        )}

        {data && (
          <>
            {/* Real KMA warnings, if any — never fabricated. */}
            {data.warnings.length > 0 && (
              <ScrollReveal amount={0.2}>
                <GlassPanel className="px-5 py-5 sm:px-7 sm:py-6">
                  <MetricLabel className="text-amber-300/80">기상 특보</MetricLabel>
                  <div className="mt-3 flex flex-col gap-2">
                    {data.warnings.map((w) => (
                      <p key={`${w.type}-${w.area}-${w.issuedAt ?? ""}`} className="text-sm text-amber-100/90">
                        {w.headline}
                        <span className="ml-2 font-mono text-[11px] text-amber-200/50">{w.area}</span>
                      </p>
                    ))}
                  </div>
                </GlassPanel>
              </ScrollReveal>
            )}

            <DeckPanel label="신뢰도 분석" sub="소스 간 교차 검증">
              <ConfidencePanel confidence={data.confidence} comparison={data.comparison} />
            </DeckPanel>

            <DeckPanel label="소스 비교" sub="제공자별 현재 예보" delay={0.05}>
              <ProviderComparison snapshots={data.providers} comparison={data.comparison} />
            </DeckPanel>

            {/* Environment sources — air quality + radar, with RainViewer attribution. */}
            <DeckPanel label="환경 소스" sub="대기질 · 레이더" delay={0.08}>
              <div className="flex flex-col gap-5">
                {data.environment.statuses.length > 0 && (
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    {data.environment.statuses.map((s) => (
                      <span key={s.id} className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${DOT[s.availability]}`} />
                        <span className="font-mono text-[11px] tracking-[0.12em] text-white/75">{s.name}</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <MetricLabel>Radar Approach · 레이더 접근</MetricLabel>
                  <p className="font-sans text-lg font-light tracking-wide text-white/95">
                    {radarSummary(snapshot?.radar)}
                  </p>
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">© RainViewer</span>
                </div>
              </div>
            </DeckPanel>

            <DeckPanel label="시네마틱 엔진" sub="영상 선택 · 라이브러리 · 폴백" delay={0.1}>
              <CinematicDiagnostics sky={snapshot} />
            </DeckPanel>

            {/* Quiet data-source attribution — a line inside the deck, not a footer. */}
            <p className="px-1 pt-2 text-center font-mono text-[11px] leading-relaxed tracking-[0.1em] text-white/45">
              SeoulSky — 서울 전용 기상 커맨드 센터 · 데이터: Open-Meteo · MET Norway
              {" / "}선택: 기상청(KMA) · Pirate Weather · 대기질: AirKorea · 레이더: RainViewer — 비공식 개인 프로젝트
            </p>
          </>
        )}
      </div>
    </SkySection>
  );
}
