"use client";

import { type MotionValue } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { useSeoulClock } from "@/hooks/useSeoulClock";
import { formatClock } from "@/lib/format";
import { readAtmosphere } from "@/lib/data-experience/atmosphericConfig";
import { CHAPTERS, CHAPTER_COUNT } from "@/lib/data-experience/chapters";
import type { WeatherStatus } from "@/hooks/useLiveSeoulWeather";
import type { SkySnapshot } from "@/lib/types";

/**
 * The three DOM typography layers over the WebGL core:
 *   • MonumentalBackdrop — huge ghost values that sit BEHIND the canvas, cropped.
 *   • ChapterOverlays    — the foreground HUD: persistent record header, per-chapter
 *                          technical labels / titles / captions, restrained detail
 *                          cards, and a scroll hint.
 *
 * Each chapter block subscribes directly to the shared scroll progress and writes
 * its opacity + drift straight to the DOM via a ref — no `motion` components and
 * no React re-render while scrolling, so the text stays exactly in step with the
 * 3D chapter transitions. (We deliberately avoid framer-motion's `motion` style
 * binding here: it hands transform/opacity off to a WAAPI animation on mount, and
 * a momentarily-NaN scroll progress before first layout produces invalid keyframe
 * offsets.) Reduced motion keeps the opacity cross-fade but removes the drift.
 */

/** Clamped piecewise-linear interpolation (xs strictly increasing). */
function lerpPiece(x: number, xs: number[], ys: number[]): number {
  if (x <= xs[0]) return ys[0];
  const n = xs.length;
  if (x >= xs[n - 1]) return ys[n - 1];
  for (let i = 1; i < n; i++) {
    if (x <= xs[i]) {
      const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + (ys[i] - ys[i - 1]) * t;
    }
  }
  return ys[n - 1];
}

function ChapterBlock({
  scrollYProgress,
  index,
  reduced,
  depth = false,
  className = "",
  children,
}: {
  scrollYProgress: MotionValue<number>;
  index: number;
  reduced: boolean;
  depth?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const last = CHAPTER_COUNT - 1;
    const c = (index + 0.5) / CHAPTER_COUNT;
    const oXs = [index === 0 ? -1 : c - 0.13, c - 0.05, c + 0.05, index === last ? 2 : c + 0.13];
    const oYs = index === 0 ? [1, 1, 1, 0] : index === last ? [0, 1, 1, 1] : [0, 1, 1, 0];
    const yXs = [c - 0.13, c - 0.02, c + 0.02, c + 0.13];
    const yIn = depth ? 90 : 46;
    const yOut = depth ? -72 : -36;
    const yYs = reduced ? [0, 0, 0, 0] : [yIn, 0, 0, yOut];

    const apply = (raw: number) => {
      const el = ref.current;
      if (!el) return;
      const s = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
      el.style.opacity = String(lerpPiece(s, oXs, oYs));
      el.style.transform = `translate3d(0, ${lerpPiece(s, yXs, yYs).toFixed(2)}px, 0)`;
    };
    apply(scrollYProgress.get());
    const unsub = scrollYProgress.on("change", apply);
    return () => unsub();
  }, [scrollYProgress, index, reduced, depth]);

  return (
    <div ref={ref} className={`absolute inset-0 ${className}`} style={{ opacity: 0, willChange: "opacity, transform" }}>
      {children}
    </div>
  );
}

// --- value formatting (null-safe) -------------------------------------------

const deg = (n: number | null) => (n == null ? "—" : `${Math.round(n)}°`);
const ms = (kmh: number | null) => (kmh == null ? "—" : (kmh / 3.6).toFixed(1)); // km/h → m/s
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n)}%`);

interface Props {
  scrollYProgress: MotionValue<number>;
  snapshot: SkySnapshot | null;
  status: WeatherStatus;
  reducedMotion: boolean;
}

// --- monumental backdrop (behind the canvas) --------------------------------

export function MonumentalBackdrop({ scrollYProgress, snapshot, reducedMotion }: Props) {
  const r = readAtmosphere(snapshot);
  const big = "font-sans font-semibold leading-none tracking-tighter text-white/[0.07] tabular-nums";
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {/* ch1 — temperature, low and to the left */}
      <ChapterBlock scrollYProgress={scrollYProgress} index={0} reduced={reducedMotion} depth>
        <span className={`absolute -bottom-[5vw] -left-[1vw] text-[34vw] sm:text-[26vw] lg:text-[20vw] ${big}`}>
          {deg(r.temperature)}
        </span>
      </ChapterBlock>
      {/* ch2 — temperature again, monumental and central */}
      <ChapterBlock scrollYProgress={scrollYProgress} index={1} reduced={reducedMotion} depth>
        <span className={`absolute right-[2vw] top-[16vh] text-[40vw] sm:text-[30vw] lg:text-[24vw] ${big}`}>
          {deg(r.temperature)}
        </span>
      </ChapterBlock>
      {/* ch3 — wind speed in m/s */}
      <ChapterBlock scrollYProgress={scrollYProgress} index={2} reduced={reducedMotion} depth>
        <span className={`absolute -left-[1vw] top-[14vh] text-[36vw] sm:text-[28vw] lg:text-[22vw] ${big}`}>
          {ms(r.windSpeed)}
        </span>
      </ChapterBlock>
      {/* ch4 — humidity */}
      <ChapterBlock scrollYProgress={scrollYProgress} index={3} reduced={reducedMotion} depth>
        <span className={`absolute -bottom-[4vw] right-[1vw] text-[34vw] sm:text-[26vw] lg:text-[20vw] ${big}`}>
          {pct(r.humidity)}
        </span>
      </ChapterBlock>
    </div>
  );
}

// --- foreground HUD ----------------------------------------------------------

function StatusDot({ status }: { status: WeatherStatus }) {
  const color = status === "live" ? "#7fffd4" : status === "error" ? "#f6a192" : "#9fb0c8";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      <span className="text-[10px] uppercase tracking-[0.3em] text-white/55">
        {status === "live" ? "LIVE" : status === "error" ? "CACHED" : "SYNC"}
      </span>
    </span>
  );
}

const LABEL = "text-[10px] sm:text-[11px] uppercase tracking-[0.36em] text-white/45";
const TITLE = "font-sans text-2xl sm:text-3xl font-medium tracking-tight text-white/90";
const CAPTION = "mt-2 max-w-xs text-sm leading-relaxed text-white/55";

function Stat({ k, v, unit }: { k: string; v: string; unit?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-white/10 py-1.5">
      <span className="text-[10px] uppercase tracking-[0.24em] text-white/40">{k}</span>
      <span className="font-sans text-sm tabular-nums text-white/85">
        {v}
        {unit && <span className="ml-1 text-[10px] text-white/45">{unit}</span>}
      </span>
    </div>
  );
}

export default function ChapterOverlays({ scrollYProgress, snapshot, status, reducedMotion }: Props) {
  const clock = useSeoulClock();
  const r = readAtmosphere(snapshot);

  const heading = (i: number) => (
    <div className="absolute bottom-[8vh] left-[6vw] right-[6vw] sm:bottom-[10vh]">
      <div className="flex items-center gap-3">
        <span className="text-[10px] tabular-nums tracking-[0.3em] text-white/40">
          {String(i + 1).padStart(2, "0")} / {String(CHAPTER_COUNT).padStart(2, "0")}
        </span>
        <span className="h-px w-8 bg-white/20" />
        <span className={LABEL}>{CHAPTERS[i].label}</span>
      </div>
      <h2 className={`mt-3 ${TITLE}`}>{CHAPTERS[i].title}</h2>
      <p className={CAPTION}>{CHAPTERS[i].caption}</p>
    </div>
  );

  const card = (children: ReactNode) => (
    <div className="absolute right-[6vw] top-[20vh] w-[min(64vw,15rem)] sm:top-[22vh]">{children}</div>
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {/* Persistent observation record header */}
      <div className="absolute left-[6vw] top-[5vh] sm:top-[6vh]">
        <div className={LABEL}>SEOUL ATMOSPHERIC RECORD</div>
        <div className="mt-1.5 text-[10px] uppercase tracking-[0.28em] text-white/35">LIVE OBSERVATION</div>
        <div className="mt-1.5 text-[10px] tabular-nums tracking-[0.18em] text-white/30">
          37.5665° N / 126.9780° E
        </div>
      </div>
      <div className="absolute right-[6vw] top-[5vh] text-right sm:top-[6vh]">
        <div className="font-sans text-lg tabular-nums tracking-wide text-white/85">
          {clock ? formatClock(clock) : "--:--:--"}
        </div>
        <div className="mt-1 text-[11px] tracking-wide text-white/55">
          {deg(r.temperature)} · {r.conditionKo}
        </div>
        <div className="mt-1.5 flex justify-end">
          <StatusDot status={status} />
        </div>
      </div>

      {/* ch1 — overview */}
      <ChapterBlock scrollYProgress={scrollYProgress} index={0} reduced={reducedMotion}>
        {heading(0)}
      </ChapterBlock>

      {/* ch2 — thermal */}
      <ChapterBlock scrollYProgress={scrollYProgress} index={1} reduced={reducedMotion}>
        {heading(1)}
        {card(
          <>
            <div className={LABEL}>THERMAL STATE</div>
            <div className="mt-3">
              <Stat k="현재" v={deg(r.temperature)} />
              <Stat k="체감" v={deg(r.apparentTemperature)} />
            </div>
          </>,
        )}
      </ChapterBlock>

      {/* ch3 — wind */}
      <ChapterBlock scrollYProgress={scrollYProgress} index={2} reduced={reducedMotion}>
        {heading(2)}
        {card(
          <>
            <div className={LABEL}>AIR MOVEMENT</div>
            <div className="mt-3">
              <Stat k="속도" v={ms(r.windSpeed)} unit="M/S" />
              <Stat k="방향" v={r.windDirectionKo || "—"} />
              <Stat k="돌풍" v={r.windGusts != null ? ms(r.windGusts) : "—"} unit={r.windGusts != null ? "M/S" : undefined} />
            </div>
          </>,
        )}
      </ChapterBlock>

      {/* ch4 — suspended water */}
      <ChapterBlock scrollYProgress={scrollYProgress} index={3} reduced={reducedMotion}>
        {heading(3)}
        {card(
          <>
            <div className={LABEL}>SUSPENDED WATER</div>
            <div className="mt-3">
              <Stat k="습도" v={pct(r.humidity)} />
              <Stat k="구름" v={pct(r.cloudCover)} />
              <Stat k="강수확률" v={pct(r.precipitationProbability)} />
            </div>
          </>,
        )}
      </ChapterBlock>

      {/* ch5 — time orbit (next-hours chips) */}
      <ChapterBlock scrollYProgress={scrollYProgress} index={4} reduced={reducedMotion}>
        {heading(4)}
        <NextHours snapshot={snapshot} />
      </ChapterBlock>

      {/* Scroll hint, ch1 only */}
      <ScrollHint scrollYProgress={scrollYProgress} />
    </div>
  );
}

function NextHours({ snapshot }: { snapshot: SkySnapshot | null }) {
  const hours = (snapshot?.hourly ?? []).slice(1, 7); // skip "now"
  if (hours.length === 0) return null;
  const hourLabel = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false }).format(new Date(iso));
  return (
    <div className="absolute right-[6vw] top-[20vh] hidden w-[min(70vw,18rem)] sm:block">
      <div className={LABEL}>NEXT HOURS</div>
      <div className="mt-3 space-y-0">
        {hours.map((h) => (
          <div key={h.time} className="flex items-baseline justify-between gap-4 border-t border-white/10 py-1.5">
            <span className="text-[11px] tabular-nums tracking-wide text-white/45">{hourLabel(h.time)}:00</span>
            <span className="font-sans text-sm tabular-nums text-white/85">{Math.round(h.temperature)}°</span>
            <span className="w-10 text-right text-[11px] tabular-nums text-white/40">
              {h.precipitationProbability != null ? `${h.precipitationProbability}%` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScrollHint({ scrollYProgress }: { scrollYProgress: MotionValue<number> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const apply = (raw: number) => {
      const el = ref.current;
      if (!el) return;
      const s = Number.isFinite(raw) ? raw : 0;
      el.style.opacity = String(lerpPiece(s, [0, 0.05], [1, 0]));
    };
    apply(scrollYProgress.get());
    const unsub = scrollYProgress.on("change", apply);
    return () => unsub();
  }, [scrollYProgress]);
  return (
    <div ref={ref} className="absolute bottom-[4vh] left-1/2 -translate-x-1/2 text-center">
      <div className="text-[10px] uppercase tracking-[0.36em] text-white/40">스크롤하여 탐색</div>
      <div className="mx-auto mt-2 h-6 w-px animate-pulse bg-gradient-to-b from-white/50 to-transparent" />
    </div>
  );
}
