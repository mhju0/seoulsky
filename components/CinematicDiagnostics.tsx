"use client";

import { useEffect, useState } from "react";
import {
  CINEMATIC_PLATES,
  CINEMATIC_PLATE_KEYS,
  isPlateGenerated,
} from "@/lib/cinematic/plateManifest";
import { selectPlateFromSky } from "@/lib/cinematic/selectPlate";
import type { SkySnapshot } from "@/lib/types";

/**
 * The cinematic-engine panel for the ground station. Everything shown is a plain
 * serializable value — never a credential, generation URL, CLI token, three.js
 * object or video DOM node.
 *
 * It recomputes the *current selection* live from /api/sky with the SAME
 * deterministic rule the scene uses, so it is correct on first view, and lists the
 * offline plate library. The former "runtime status · last `/` visit" column was
 * retired with the plane home page in Phase 2 — nothing writes that bridge any
 * more, so it could only ever show a dead-route empty state; it is removed here
 * rather than left as a permanently-blank panel.
 */

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/10 py-2 last:border-0">
      <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.16em] text-white/55">{label}</span>
      <span className="text-right font-sans text-sm font-light text-white/95">{value}</span>
    </div>
  );
}

function ColumnLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-white/55">{children}</p>
  );
}

export default function CinematicDiagnostics({ sky: skyProp }: { sky?: SkySnapshot | null }) {
  const sharedSky = skyProp !== undefined;
  const [fetchedSky, setFetchedSky] = useState<SkySnapshot | null>(null);

  useEffect(() => {
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

  return (
    <div className="flex flex-col gap-9">
      <div className="max-w-xl">
        <ColumnLabel>현재 선택 · 실시간 규칙</ColumnLabel>
        <Row label="선택 플레이트" value={current.key} />
        <Row label="선택 근거" value={current.reason} />
        <Row label="시간대 (태양 위상)" value={current.phase} />
        <Row label="낮/밤" value={current.isDay ? "낮" : "밤"} />
        <Row label="플레이트 파일" value={def.generated ? "있음 ✓" : "없음 → 절차적 씬"} />
        <Row label="포맷" value={def.mp4Src ? (def.webmSrc ? "webm + mp4" : "mp4") : "—"} />
      </div>

      <div>
        <ColumnLabel>
          플레이트 라이브러리 · {generated.length}/{CINEMATIC_PLATE_KEYS.length} 생성됨
        </ColumnLabel>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {CINEMATIC_PLATE_KEYS.map((k) => (
            <span
              key={k}
              className={`font-mono text-[11px] tracking-wide ${
                isPlateGenerated(k) ? "text-emerald-300/90" : "text-white/40"
              }`}
            >
              {k}
              {isPlateGenerated(k) ? " ✓" : ""}
            </span>
          ))}
        </div>
        <p className="mt-4 max-w-2xl text-[11px] leading-relaxed text-white/50">
          영상은 오프라인(Claude CLI의 Higgsfield 도구)에서 생성되어 public/cinematic/에
          저장됩니다. 런타임에는 Higgsfield를 호출하지 않으며, 조건에 맞는 클립이 없거나
          재생에 실패하면 실시간 절차적 3D 씬으로 자동 대체됩니다.
        </p>
      </div>
    </div>
  );
}
