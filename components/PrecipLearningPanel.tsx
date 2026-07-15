"use client";

import { formatClock, formatHeaderDate, timeAgoKo } from "@/lib/format";
import type { PrecipLearningSummary, ProviderSnapshot } from "@/lib/types";
import { MetricLabel } from "./atmosphere/EtchedType";

interface Props {
  learning: PrecipLearningSummary;
  providers: ProviderSnapshot[];
}

const REASON_COPY: Record<string, string> = {
  disabled: "비상 중지 설정으로 학습 가중치를 사용하지 않습니다.",
  "no-weights-state": "검증된 학습 상태가 없어 참여 소스를 동일하게 반영합니다.",
  "future-checkpoint": "학습 상태의 시간을 확인할 수 없어 동일 가중치로 보호합니다.",
  stale: "최근 KMA 관측 검증이 없어 동일 가중치로 안전하게 전환했습니다.",
  "pre-warmup": "검증 사례가 아직 적어 참여 소스를 동일하게 반영합니다.",
  ramping: "동일 가중치와 학습값을 섞어 증거가 쌓일수록 학습 반영을 늘립니다.",
  learned: "충분히 누적된 완료 예보 기록을 현재 강수 합의에 반영합니다.",
};

function modeLabel(learning: PrecipLearningSummary): string {
  if (!learning.enabled) return "학습 비활성";
  if (!learning.multiSource) return "단일 소스 폴백";
  if (learning.mode === "learned") return "학습 가중치 적용";
  if (learning.mode === "ramping") return "학습 반영 중";
  return "동일 가중치";
}

function formatWeight(weight: number | undefined): string {
  return weight === undefined ? "—" : `${(weight * 100).toFixed(2)}%`;
}

function formatLearningTime(iso: string | null): string {
  if (!iso) return "검증 기록 없음";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "검증 기록 없음";
  return `${formatHeaderDate(date)} · ${formatClock(date)} · 한국 표준시`;
}

export default function PrecipLearningPanel({ learning, providers }: Props) {
  const confidencePct = Math.round(learning.confidence * 100);
  const explanation =
    learning.enabled && !learning.multiSource
      ? "현재 응답한 강수 제공자가 한 곳뿐이라 학습값과 관계없이 그 예보를 그대로 사용합니다."
      : REASON_COPY[learning.reason] ??
        "현재 사용 가능한 증거에 맞춰 강수 가중치를 조정합니다.";
  const providerById = new Map<string, ProviderSnapshot>(
    providers.map((provider) => [provider.id, provider]),
  );
  const sourceIds = Array.from(
    new Set([
      ...providers.map((provider) => provider.id),
      ...Object.keys(learning.learnedWeights),
      ...Object.keys(learning.effectiveWeights),
    ]),
  ).filter(
    (id) => learning.learnedWeights[id] !== undefined || learning.effectiveWeights[id] !== undefined,
  );

  return (
    <div className="grid gap-9 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-14">
      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="sky-display text-[clamp(1.65rem,3vw,2.45rem)] text-white">
            {modeLabel(learning)}
          </p>
          <span className="font-mono text-sm tabular-nums tracking-[0.12em] text-white">
            {confidencePct}% 반영
          </span>
        </div>

        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"
          role="img"
          aria-label={`학습 가중치 반영률 ${confidencePct}%`}
        >
          <div className="h-full rounded-full bg-white/55" style={{ width: `${confidencePct}%` }} />
        </div>

        <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/75">
          {explanation}
        </p>
        <p className="mt-3 max-w-xl text-xs leading-relaxed text-white/55">
          완료된 서울 강수 예보를 KMA ASOS 일관측과 비교한 기록입니다. 가중치는 과거 강수 성능을 나타내며 오늘의 확실성을 보장하지 않습니다.
        </p>

        <div className="mt-7 grid grid-cols-2 gap-x-7 gap-y-5 border-t border-white/12 pt-5">
          <div>
            <MetricLabel className="text-white/60">검증한 강수 날짜</MetricLabel>
            <p className="mt-2 font-sans text-2xl font-light tabular-nums text-white">
              {learning.datesScored}일
            </p>
          </div>
          <div>
            <MetricLabel className="text-white/60">채점한 제공자 예보</MetricLabel>
            <p className="mt-2 font-sans text-2xl font-light tabular-nums text-white">
              {learning.eventsScored}건
            </p>
          </div>
          <div className="col-span-2 border-t border-white/10 pt-4">
            <MetricLabel className="text-white/60">마지막 KMA 관측 검증</MetricLabel>
            <p className="mt-2 font-sans text-sm text-white">
              {learning.updatedAt ? timeAgoKo(learning.updatedAt) : "기록 없음"}
            </p>
            <p className="mt-1 font-mono text-[10px] leading-relaxed tracking-[0.1em] text-white/55">
              {formatLearningTime(learning.updatedAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <MetricLabel tone="bright">제공자별 강수 가중치</MetricLabel>
          <span className="font-mono text-[10px] tracking-[0.14em] text-white/55">
            오늘 반영 · 저장된 학습값
          </span>
        </div>

        <ol className="flex flex-col" aria-label="제공자별 강수 가중치">
          {sourceIds.map((sourceId) => {
            const provider = providerById.get(sourceId);
            const effective = learning.effectiveWeights[sourceId];
            const learned = learning.learnedWeights[sourceId];
            const participating = effective !== undefined;
            return (
              <li key={sourceId} className="border-t border-white/10 py-4 first:border-t-white/18">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <span className="block truncate font-mono text-[12px] tracking-[0.1em] text-white">
                      {provider?.status.name ?? sourceId}
                    </span>
                    <span className="mt-1 block font-sans text-[10px] text-white/50">
                      {participating ? "오늘 합의에 참여" : "오늘 응답 없음 · 합의에서 제외"}
                    </span>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <span className="font-sans text-lg font-light text-white">
                      {participating ? formatWeight(effective) : "미참여"}
                    </span>
                    <span className="ml-2 font-mono text-[10px] text-white/50">
                      학습값 {formatWeight(learned)}
                    </span>
                  </div>
                </div>
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
                  {participating && (
                    <div
                      className="h-full rounded-full bg-white/45"
                      style={{ width: `${Math.max(0, Math.min(100, effective * 100))}%` }}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
