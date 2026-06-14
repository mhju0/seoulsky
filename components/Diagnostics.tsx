"use client";

import { formatKstTime, timeAgoKo } from "@/lib/format";
import { SEOUL } from "@/lib/seoul";
import type { ProviderAvailability, WeatherIntelligence } from "@/lib/types";

interface Props {
  data: WeatherIntelligence;
}

const AVAILABILITY_KO: Record<ProviderAvailability, { label: string; dot: string }> = {
  ok: { label: "정상", dot: "bg-emerald-400" },
  "needs-config": { label: "설정 필요", dot: "bg-amber-400" },
  error: { label: "오류", dot: "bg-rose-400" },
  unavailable: { label: "미지원", dot: "bg-slate-500" },
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5">
      <h3 className="mb-3 text-xs font-semibold tracking-widest text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

export default function Diagnostics({ data }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <Panel title="소스 구성">
        <ul className="flex flex-col gap-2.5">
          {data.providers.map((p) => {
            const a = AVAILABILITY_KO[p.status.availability];
            return (
              <li key={p.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${a.dot}`} />
                  <span className="text-slate-200">{p.status.name}</span>
                  <span className="ml-auto text-xs text-slate-500">
                    {a.label}
                    {p.status.stale ? " · 지연 캐시" : ""}
                  </span>
                </div>
                {p.status.missingEnvVars.length > 0 && (
                  <p className="mt-1 pl-3.5 font-mono text-[10px] text-slate-500">
                    필요: {p.status.missingEnvVars.join(", ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="캐시 상태">
        {data.cache.entries.length === 0 ? (
          <p className="text-sm text-slate-500">캐시 비어 있음</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.cache.entries.map((e) => (
              <li key={e.key} className="flex items-baseline justify-between text-sm">
                <code className="font-mono text-xs text-slate-300">{e.key}</code>
                <span className="text-xs text-slate-500">{e.ageSeconds}초 전 적재</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">
          메모리 캐시 · TTL {data.cache.ttlSeconds / 60}분 — API 호출을 최소화합니다
        </p>
      </Panel>

      <Panel title="시스템">
        <ul className="flex flex-col gap-2 text-sm text-slate-300">
          <li className="flex justify-between">
            <span className="text-slate-500">마지막 집계</span>
            <span>
              {formatKstTime(data.generatedAt)} ({timeAgoKo(data.generatedAt)})
            </span>
          </li>
          <li className="flex justify-between">
            <span className="text-slate-500">자동 새로고침</span>
            <span>5분 간격</span>
          </li>
          <li className="flex justify-between">
            <span className="text-slate-500">관측 지점</span>
            <span>
              {SEOUL.latitude}°N {SEOUL.longitude}°E
            </span>
          </li>
          <li className="flex justify-between">
            <span className="text-slate-500">시간대</span>
            <span>{SEOUL.timezone} (KST)</span>
          </li>
        </ul>
      </Panel>
    </div>
  );
}
