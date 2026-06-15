"use client";

import { useEffect, useState } from "react";
import {
  CINEMATIC_PLATES,
  CINEMATIC_PLATE_KEYS,
  isPlateGenerated,
} from "@/lib/cinematic/plateManifest";
import { selectPlateFromSky } from "@/lib/cinematic/selectPlate";
import { readCinematicStatus, type CinematicRuntimeStatus } from "@/lib/cinematic/cinematicStatus";
import type { SkySnapshot } from "@/lib/types";

/**
 * The cinematic-engine panel for /diagnostics. Everything shown is a plain
 * serializable value — never a credential, generation URL, CLI token, three.js
 * object or video DOM node.
 *
 * Two columns:
 *   • "current selection" — recomputed live from /api/sky with the SAME
 *     deterministic rule the home page uses, so it's correct even before `/`
 *     has been visited.
 *   • "runtime status" — the flat snapshot the home page last wrote to
 *     localStorage (render mode, playing plate, format, load state, errors).
 */

const MODE_KO: Record<string, string> = {
  hybrid: "하이브리드 (영상 + 실시간 3D)",
  procedural: "절차적 3D",
  "fallback-2d": "2D 폴백",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/10 py-2 last:border-0">
      <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">{label}</span>
      <span className="text-right font-sans text-sm font-light text-white/85">{value}</span>
    </div>
  );
}

function ColumnLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-white/45">{children}</p>
  );
}

export default function CinematicDiagnostics({ sky: skyProp }: { sky?: SkySnapshot | null }) {
  const sharedSky = skyProp !== undefined;
  const [fetchedSky, setFetchedSky] = useState<SkySnapshot | null>(null);
  const [runtime, setRuntime] = useState<CinematicRuntimeStatus | null>(null);

  useEffect(() => {
    queueMicrotask(() => setRuntime(readCinematicStatus()));
    // The shell already loaded /api/sky and passes it in — only fetch as a
    // standalone fallback (e.g. if this panel is ever used outside the shell).
    if (sharedSky) return;
    let alive = true;
    fetch("/api/sky", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setFetchedSky(d as SkySnapshot | null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sharedSky]);

  const sky = sharedSky ? skyProp : fetchedSky;
  const current = selectPlateFromSky(sky ?? null);
  const def = CINEMATIC_PLATES[current.key];
  const generated = CINEMATIC_PLATE_KEYS.filter(isPlateGenerated);
  const fmtTime = (t: number | null) =>
    t ? new Date(t).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" }) : "—";

  return (
    <div className="grid grid-cols-1 gap-x-14 gap-y-9 lg:grid-cols-2">
      <div>
        <ColumnLabel>현재 선택 · 실시간 규칙</ColumnLabel>
        <Row label="선택 플레이트" value={current.key} />
        <Row label="선택 근거" value={current.reason} />
        <Row label="시간대 (태양 위상)" value={current.phase} />
        <Row label="낮/밤" value={current.isDay ? "낮" : "밤"} />
        <Row label="플레이트 파일" value={def.generated ? "있음 ✓" : "없음 → 절차적 씬"} />
        <Row
          label="포맷"
          value={def.mp4Src ? (def.webmSrc ? "webm + mp4" : "mp4") : "—"}
        />
      </div>

      <div>
        <ColumnLabel>런타임 상태 · 마지막 ‘/’ 방문</ColumnLabel>
        {runtime ? (
          <>
            <Row label="렌더 모드" value={MODE_KO[runtime.renderMode] ?? runtime.renderMode} />
            <Row label="재생 플레이트" value={runtime.plateKey ?? "—"} />
            <Row label="활성 포맷" value={runtime.activeFormat ?? "—"} />
            <Row label="로드 상태" value={runtime.loadState} />
            <Row label="절차적 폴백" value={runtime.proceduralFallback ? "예" : "아니오"} />
            <Row label="폴백 사유" value={runtime.fallbackReason ?? "—"} />
            <Row label="마지막 전환" value={fmtTime(runtime.lastTransitionAt)} />
            <Row label="재생 오류" value={runtime.lastError ?? "없음"} />
          </>
        ) : (
          <p className="text-xs leading-relaxed text-white/40">
            아직 시네마틱 페이지(/) 방문 기록이 없습니다. 홈을 한 번 열면 표시됩니다.
          </p>
        )}
      </div>

      <div className="lg:col-span-2">
        <ColumnLabel>
          플레이트 라이브러리 · {generated.length}/{CINEMATIC_PLATE_KEYS.length} 생성됨
        </ColumnLabel>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {CINEMATIC_PLATE_KEYS.map((k) => (
            <span
              key={k}
              className={`font-mono text-[11px] tracking-wide ${
                isPlateGenerated(k) ? "text-emerald-300/90" : "text-white/30"
              }`}
            >
              {k}
              {isPlateGenerated(k) ? " ✓" : ""}
            </span>
          ))}
        </div>
        <p className="mt-4 max-w-2xl text-[11px] leading-relaxed text-white/40">
          영상 플레이트는 오프라인(Claude CLI의 Higgsfield 도구)에서 생성되어
          public/cinematic/generated/에 저장됩니다. 런타임에는 Higgsfield를 호출하지
          않으며, 파일이 없거나 재생에 실패하면 실시간 절차적 3D 씬으로 자동 대체됩니다.
        </p>
      </div>
    </div>
  );
}
