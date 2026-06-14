import type { DailyForecast } from "./types";

/**
 * Client-safe display helpers. Everything renders in Asia/Seoul regardless
 * of the machine's locale, so the dashboard always shows Seoul wall time.
 */

const KST = "Asia/Seoul";

export function formatHeaderDate(d: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(d);
}

export function formatClock(d: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

/** "21시" style label for hourly cards. */
export function hourLabel(iso: string): string {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: KST,
    hour: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return `${Number(h)}시`;
}

export function formatKstTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Seoul-local YYYY-MM-DD for a Date or ISO string. */
export function seoulDateStr(d: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof d === "string" ? new Date(d) : d);
}

/** "오늘" / "내일" / "토요일" for the daily list. */
export function dayLabel(dateStr: string): string {
  const today = seoulDateStr(new Date());
  if (dateStr === today) return "오늘";
  const tomorrow = seoulDateStr(new Date(Date.now() + 24 * 3600_000));
  if (dateStr === tomorrow) return "내일";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    weekday: "long",
  }).format(new Date(`${dateStr}T12:00:00+09:00`));
}

const COMPASS_KO = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"] as const;

export function windDirectionKo(deg: number | null): string {
  if (deg === null || Number.isNaN(deg)) return "";
  return COMPASS_KO[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

export function timeAgoKo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 60) return "방금 전";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  return `${Math.floor(seconds / 86400)}일 전`;
}

/**
 * Build a day/night test from a provider's daily sunrise/sunset data,
 * falling back to fixed hours when the provider has none (e.g. KMA).
 */
export function makeIsNightAt(daily: DailyForecast[]): (iso: string) => boolean {
  const sunTimes = new Map(
    daily
      .filter((d) => d.sunrise && d.sunset)
      .map((d) => [d.date, { rise: Date.parse(d.sunrise!), set: Date.parse(d.sunset!) }]),
  );
  return (iso: string) => {
    const t = Date.parse(iso);
    const day = sunTimes.get(seoulDateStr(iso));
    if (day && Number.isFinite(day.rise) && Number.isFinite(day.set)) {
      return t < day.rise || t > day.set;
    }
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: KST, hour: "2-digit", hour12: false }).format(
        new Date(iso),
      ),
    );
    return hour < 6 || hour >= 19;
  };
}
