/**
 * The five visual chapters of SEOUL ATMOSPHERIC CORE and the pure scroll-math
 * that maps a global 0..1 scroll progress onto them. No three.js, no React — the
 * scene reads `activation()` for per-layer fades and the overlays read the copy.
 */

export type ChapterId = "overview" | "thermal" | "wind" | "water" | "orbit";

export interface Chapter {
  id: ChapterId;
  /** Small technical label (uppercase, English). */
  label: string;
  /** Korean chapter title. */
  title: string;
  /** One short atmospheric line (Korean). */
  caption: string;
}

export const CHAPTERS: readonly Chapter[] = [
  {
    id: "overview",
    label: "ATMOSPHERE OVERVIEW",
    title: "서울 대기 코어",
    caption: "도시의 공기가 하나의 관측 장치 안에서 깨어납니다.",
  },
  {
    id: "thermal",
    label: "THERMAL STATE",
    title: "열의 상태",
    caption: "코어의 안쪽이 기온을 따라 부풀고 식습니다.",
  },
  {
    id: "wind",
    label: "AIR MOVEMENT",
    title: "공기의 흐름",
    caption: "바람이 코어를 통과하며 방향과 속도를 그립니다.",
  },
  {
    id: "water",
    label: "SUSPENDED WATER",
    title: "머금은 물",
    caption: "습기와 구름이 유리 안쪽에서 응결합니다.",
  },
  {
    id: "orbit",
    label: "TIME ORBIT",
    title: "시간의 궤도",
    caption: "다가오는 시간들이 코어를 둘러싸고 회전합니다.",
  },
] as const;

export const CHAPTER_COUNT = CHAPTERS.length;

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const smoothstep = (e0: number, e1: number, x: number) => {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Active chapter index + local 0..1 progress within it, from global scroll. */
export function chapterAt(scroll: number): { index: number; local: number } {
  const s = clamp01(scroll) * CHAPTER_COUNT;
  const index = Math.min(CHAPTER_COUNT - 1, Math.floor(s));
  return { index, local: s - index };
}

/**
 * 0..1 plateau "on" weight for a chapter band [lo, hi] of global scroll, with a
 * soft `fade` ramp on each side. Edge bands (lo<=0 / hi>=1) hold fully on at the
 * ends so the first/last chapters never flicker off at the scroll extremes.
 */
export function smoothBand(scroll: number, lo: number, hi: number, fade = 0.12): number {
  const s = clamp01(scroll);
  const up = lo <= 0 ? 1 : smoothstep(lo - fade, lo, s);
  const down = hi >= 1 ? 1 : 1 - smoothstep(hi, hi + fade, s);
  return clamp01(up * down);
}

/** Each chapter spans an equal 1/N slice of the scroll. */
export function chapterRange(index: number): [number, number] {
  return [index / CHAPTER_COUNT, (index + 1) / CHAPTER_COUNT];
}

/**
 * Per-chapter activation weight (0..1) centred on chapter `index`, padded so it
 * eases in slightly before the section and out slightly after — used by scene
 * layers to fade their contribution in and out as the user scrolls.
 */
export function activation(scroll: number, index: number, pad = 0.06, fade = 0.1): number {
  const [lo, hi] = chapterRange(index);
  return smoothBand(scroll, lo - pad, hi + pad, fade);
}
