"use client";

import { useInView } from "framer-motion";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { formatClock, formatHeaderDate, timeAgoKo } from "@/lib/format";
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
 * Section 5 — Ground Station. The data deck where the scroll lands: cross-provider
 * confidence, the source comparison, the environment sources (air + radar, with
 * the required RainViewer attribution) and the cinematic-engine diagnostics — all
 * re-skinned into the matte reading panels, all the original data/logic preserved.
 *
 * PERF: the heavier /api/weather intelligence fetch is deferred until this final
 * section is approaching (useInView, ~400px early) and refreshed every 5 min; the
 * shared sky snapshot (bands above) is never re-fetched. The former Sun & Sky
 * section (celestial dial + Recharts wind chart) has been removed, so nothing
 * heavy mounts here beyond this fetch.
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

const CONFIDENCE_LABELS: Record<WeatherIntelligence["confidence"]["level"], string> = {
  high: "대체로 신뢰 가능",
  medium: "일부 차이 있음",
  low: "소스 차이 큼",
  "single-source": "비교 제한",
};

/** Honest one-line radar approach summary — never invents a direction. */
function radarSummary(radar: SkyRadar | null | undefined): string {
  if (!radar) return "레이더 관측 없음";
  if (radar.approaching && radar.fromDirection) return `${radar.fromDirection}쪽에서 비구름 접근 중`;
  if (radar.precipNearby) return "서울 부근에 강수 관측";
  return "접근하는 비구름 없음";
}

function comparedProviderNames(data: WeatherIntelligence): string {
  const compared = data.comparison?.providersCompared ?? [];
  const names = data.providers
    .filter((p) => compared.includes(p.id))
    .map((p) => p.status.name);
  if (names.length > 0) return names.join(" · ");

  const live = data.providers
    .filter((p) => p.status.availability === "ok" && p.current)
    .map((p) => p.status.name);
  return live.length > 0 ? live.join(" · ") : "비교 가능한 실시간 소스 없음";
}

function formatUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return "업데이트 시간 없음";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "업데이트 시간 없음";
  return `${formatHeaderDate(date)} · ${formatClock(date)} KST`;
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
          <MetricLabel tone="bright">{label}</MetricLabel>
          {sub && <span className="font-mono text-[10px] tracking-[0.2em] text-white">{sub}</span>}
        </div>
        {children}
      </GlassPanel>
    </ScrollReveal>
  );
}

function SummaryTile({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="border-t border-white/10 pt-3">
      <MetricLabel className="text-white/60">{label}</MetricLabel>
      <p className="mt-2 font-sans text-xl font-light leading-tight text-white">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/60">{caption}</p>
    </div>
  );
}

export default function GroundStationSection() {
  const { snapshot } = useWeatherField();
  const clock = useWeatherClock();
  const [data, setData] = useState<WeatherIntelligence | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedId = useId();

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
      <SectionHeading index="05" en="Confidence" ko="예보 신뢰도" />

      <div ref={deckRef} className="flex flex-col gap-4 sm:gap-5">
        {/* Confidence-first summary for normal users. */}
        <ScrollReveal amount={0.1}>
          <GlassPanel className="px-5 py-6 sm:px-7 sm:py-7">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
              <div>
                <MetricLabel tone="bright">신뢰도 요약</MetricLabel>
                <p className="mt-2 font-sans text-[clamp(1.4rem,3.4vw,2rem)] font-light text-white">
                  서울 예보를 신뢰해도 될까요?
                </p>
                <p className="mt-1 font-mono text-xs tracking-[0.12em] text-white">
                  {clock ? formatHeaderDate(clock) : " "} · 대한민국 서울
                </p>
              </div>
              <div className="flex items-center gap-5">
                <div className="text-right">
                  <p className="font-sans text-2xl font-light tabular-nums text-white">
                    {clock ? formatClock(clock) : "--:--:--"}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] tracking-[0.3em] text-white">SEOUL · KST</p>
                </div>
                <button
                  type="button"
                  onClick={load}
                  disabled={refreshing}
                  aria-label={refreshing ? "예보 신뢰도 데이터 동기화 중" : "예보 신뢰도 데이터 새로고침"}
                  className="min-h-11 font-mono text-[11px] uppercase tracking-[0.2em] text-white transition hover:text-white/80 disabled:opacity-50"
                >
                  {refreshing ? "동기화 중" : "↻ 새로고침"}
                </button>
              </div>
            </div>

            {data && (
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <SummaryTile
                  label="종합 판단"
                  value={CONFIDENCE_LABELS[data.confidence.level]}
                  caption={data.confidence.overall !== null ? `신뢰도 ${data.confidence.overall}%` : "단일 소스 기준"}
                />
                <SummaryTile
                  label="소스 일치"
                  value={data.comparison?.headline ?? "소스 비교 대기"}
                  caption={comparedProviderNames(data)}
                />
                <SummaryTile
                  label="업데이트"
                  value={timeAgoKo(data.generatedAt)}
                  caption={formatUpdatedAt(data.generatedAt)}
                />
              </div>
            )}

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
                    <span className="font-mono text-[10px] tracking-[0.14em] text-white">{p.status.name}</span>
                  </span>
                ))}
              </div>
            )}
          </GlassPanel>
        </ScrollReveal>

        {!near && (
          <p className="py-6 font-mono text-[11px] uppercase tracking-[0.25em] text-white">
            ↓ 지상 관측소 데이터를 불러옵니다
          </p>
        )}

        {near && !data && !failed && (
          <div className="flex items-center gap-3 py-6">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white/70" />
            <span className="font-mono text-xs uppercase tracking-[0.25em] text-white">
              교차 검증 데이터 수신 중
            </span>
          </div>
        )}

        {!data && failed && (
          <GlassPanel className="px-5 py-6 sm:px-7 sm:py-7">
            <p className="font-sans text-lg font-light text-white">데이터 수신 실패</p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white">
              기상 소스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.
            </p>
            <button
              type="button"
              onClick={load}
              aria-label="예보 신뢰도 데이터 다시 시도"
              className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white transition hover:text-white/80"
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

            <div className="flex justify-center pt-1">
              <button
                type="button"
                aria-expanded={advancedOpen}
                aria-controls={advancedId}
                onClick={() => setAdvancedOpen((open) => !open)}
                className="min-h-11 rounded-full border border-white/15 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
              >
                {advancedOpen ? "고급 진단 숨기기" : "고급 진단 보기"}
              </button>
            </div>

            {advancedOpen && (
              <div id={advancedId} className="flex flex-col gap-4 sm:gap-5">
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
                            <span className="font-mono text-[11px] tracking-[0.12em] text-white">
                              {s.name}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <MetricLabel tone="bright">Radar Approach · 레이더 접근</MetricLabel>
                      <p className="font-sans text-lg font-light tracking-wide text-white">
                        {radarSummary(snapshot?.radar)}
                      </p>
                      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white">
                        © RainViewer
                      </span>
                    </div>
                  </div>
                </DeckPanel>

                <DeckPanel label="고급 · 시네마틱 엔진" sub="영상 선택 · 라이브러리 · 폴백" delay={0.1}>
                  <CinematicDiagnostics sky={snapshot} />
                </DeckPanel>
              </div>
            )}

            {/* Quiet data-source attribution — a line inside the deck, not a footer. */}
            <p className="px-1 pt-2 text-center font-mono text-[11px] leading-relaxed tracking-[0.1em] text-white">
              SeoulSky — 서울 전용 기상 커맨드 센터 · 데이터: Open-Meteo · MET Norway
              {" / "}선택: 기상청(KMA) · Pirate Weather · WeatherAPI · 대기질: AirKorea · 레이더: 기상청(KMA) · 레이더 접근: RainViewer — 비공식 개인 프로젝트
            </p>
          </>
        )}
      </div>
    </SkySection>
  );
}
