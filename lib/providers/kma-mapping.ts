import type { NormalizedWarning, WeatherCondition } from "../types";

/**
 * Pure KMA value mappers — no I/O, no env, no time. Kept separate from kma.ts so
 * the category/warning logic is unit-testable in isolation (see kma-mapping.test.ts).
 */

/**
 * 강수형태(PTY) takes priority; otherwise 하늘상태(SKY). Shared by both
 * 초단기실황 (PTY only) and 단기예보 (PTY + SKY).
 *
 * PTY: 0 없음 · 1 비 · 2 비/눈 · 3 눈 · 4 소나기 · 5 빗방울 · 6 빗방울눈날림 · 7 눈날림
 * SKY: 1 맑음 · 3 구름많음 · 4 흐림
 */
export function conditionFromKma(pty: number, sky: number): WeatherCondition {
  switch (pty) {
    case 1:
    case 4:
      return "rain";
    case 2:
    case 6:
      return "sleet";
    case 3:
    case 7:
      return "snow";
    case 5:
      return "drizzle";
  }
  switch (sky) {
    case 1:
      return "clear";
    case 3:
      return "cloudy";
    case 4:
      return "overcast";
  }
  return "unknown";
}

/** Official KMA 특보 hazard types (환경부 미세먼지/오존 경보 belong to AirKorea, not here). */
const HAZARD = "태풍|호우|대설|강풍|풍랑|건조|폭염|한파|황사|폭풍해일|지진해일";
const LEVEL = "예비특보|경보|주의보";
// hazard immediately (allowing whitespace) followed by a level, but NOT a lift ("… 해제").
const WARN_RE = new RegExp(`(${HAZARD})\\s*(${LEVEL})(?!\\s*해제)`, "g");

/** Collision-safe identity for one normalized warning occurrence. */
export function warningIdentity(
  warning: Pick<NormalizedWarning, "source" | "area" | "type" | "level" | "issuedAt">,
): string {
  return JSON.stringify([
    warning.source,
    warning.area,
    warning.type,
    warning.level,
    warning.issuedAt,
  ]);
}

/** yyyymmddHHMM (KST wall-clock) → ISO with +09:00, or null when unparseable. */
export function tmFcToIso(tmFc: string | null | undefined): string | null {
  if (!tmFc || !/^\d{12}$/.test(tmFc)) return null;
  return (
    `${tmFc.slice(0, 4)}-${tmFc.slice(4, 6)}-${tmFc.slice(6, 8)}` +
    `T${tmFc.slice(8, 10)}:${tmFc.slice(10, 12)}:00+09:00`
  );
}

/**
 * Defensive 특보 extraction from a bulletin's combined text. Conservative by
 * design: emits a warning only for an unambiguous "<hazard><level>" token that
 * is not part of a lift ("해제") message. Deduped by normalized identity.
 *
 * KMA's getWthrWrnList sprays warning prose across loosely-typed fields
 * (title / t1..t7 / other) whose presence varies per release, so callers should
 * concatenate every string field of the latest bulletin and pass it here.
 */
export function extractWarnings(
  text: string,
  opts: { issuedAt: string | null; area: string },
): NormalizedWarning[] {
  const seen = new Set<string>();
  const out: NormalizedWarning[] = [];
  for (const m of text.matchAll(WARN_RE)) {
    const type = m[1];
    const level = m[2] as NormalizedWarning["level"];
    const identity = warningIdentity({
      source: "kma",
      area: opts.area,
      type,
      level,
      issuedAt: opts.issuedAt,
    });
    if (seen.has(identity)) continue;
    seen.add(identity);
    out.push({
      id: identity,
      type,
      level,
      area: opts.area,
      issuedAt: opts.issuedAt,
      headline: `${opts.area} ${type}${level === "예비특보" ? " 예비특보" : level}`,
      source: "kma",
    });
  }
  return out;
}
