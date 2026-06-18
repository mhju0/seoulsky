import { classifyKmaResponse } from "../providers/kma.ts";
import { REGION } from "./constants.ts";
import type { ObservationRecord } from "./types.ts";

/**
 * Independent ground truth: KMA ASOS observed daily precipitation (일강수량) for a
 * completed day in Seoul. This is the *observation* (실황/실측) — deliberately kept
 * separate from KMA's forecast and never scored as a forecast source.
 *
 * AsosDalyInfoService/getWthrDataList on data.go.kr. Uses KMA_OBSERVATION_API_KEY
 * if set, else falls back to KMA_SHORT_TERM_API_KEY (one data.go.kr account key
 * often covers multiple subscribed services). With no key, the fetch failing, or
 * no usable record, returns null and the caller skips scoring — never fabricated.
 */

const ASOS_BASE = "https://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList";
/** Seoul ASOS surface station (지점번호 108) — the canonical KMA station for central Seoul. */
const SEOUL_ASOS_STN = 108;

/** data.go.kr issues URL-encoded or plain keys; normalize to plain. Never logged. */
function observationServiceKey(): string | null {
  const raw = process.env.KMA_OBSERVATION_API_KEY ?? process.env.KMA_SHORT_TERM_API_KEY;
  const v = raw?.trim();
  if (!v) return null;
  return v.includes("%") ? decodeURIComponent(v) : v;
}

interface AsosDailyItem {
  /** 일강수량 (mm); blank string on dry days (no measurable precipitation). */
  sumRn?: string;
  tm?: string;
  stnId?: string;
}

/** data.go.kr returns `item` as an array (many rows) or a bare object (one row). */
function asItemArray(raw: unknown): AsosDailyItem[] {
  if (Array.isArray(raw)) return raw as AsosDailyItem[];
  if (raw && typeof raw === "object") return [raw as AsosDailyItem];
  return [];
}

/**
 * Fetch observed daily precipitation (mm) for `date` (YYYY-MM-DD, Asia/Seoul).
 * Returns null when unavailable so the day is skipped rather than guessed.
 */
export async function fetchObservedPrecip(date: string): Promise<ObservationRecord | null> {
  const key = observationServiceKey();
  if (!key) return null;

  const dt = date.replace(/-/g, "");
  const params = new URLSearchParams({
    serviceKey: key,
    dataType: "JSON",
    dataCd: "ASOS",
    dateCd: "DAY",
    startDt: dt,
    endDt: dt,
    stnIds: String(SEOUL_ASOS_STN),
    numOfRows: "10",
    pageNo: "1",
  });

  let httpStatus: number;
  let text: string;
  try {
    const res = await fetch(`${ASOS_BASE}?${params}`, { signal: AbortSignal.timeout(15_000) });
    httpStatus = res.status;
    text = await res.text();
  } catch {
    return null; // network/timeout → skip (no fabrication)
  }

  // Reuse KMA's key-free classifier: distinguishes a real "no data" from auth/rate errors.
  const c = classifyKmaResponse(httpStatus, text);
  if (c.class !== "ok") return null; // empty | forbidden | rate-limited | error → skip

  const row = asItemArray(c.json?.response.body?.items?.item)[0];
  if (!row) return null;

  // ASOS leaves 일강수량 blank on dry days. A present daily record with a blank
  // sumRn means 0.0 mm observed (no measurable precip), NOT missing data.
  const raw = (row.sumRn ?? "").trim();
  const observed_mm = raw === "" ? 0 : Number(raw);
  if (!Number.isFinite(observed_mm) || observed_mm < 0) return null;

  return {
    date,
    region: REGION,
    observed_mm,
    source: "kma-asos-observation",
    observedAt: new Date().toISOString(),
  };
}
