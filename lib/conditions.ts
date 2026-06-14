import type { WeatherCondition } from "./types";

export const CONDITION_LABELS_KO: Record<WeatherCondition, string> = {
  clear: "맑음",
  "partly-cloudy": "구름 조금",
  cloudy: "구름 많음",
  overcast: "흐림",
  fog: "안개",
  drizzle: "이슬비",
  rain: "비",
  "heavy-rain": "폭우",
  snow: "눈",
  sleet: "진눈깨비",
  thunderstorm: "뇌우",
  unknown: "정보 없음",
};

/** WMO weather interpretation codes (used by Open-Meteo). */
export function conditionFromWmoCode(code: number): WeatherCondition {
  if (code === 0) return "clear";
  if (code === 1 || code === 2) return "partly-cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code === 65 || code === 82) return "heavy-rain";
  if ((code >= 61 && code <= 64) || code === 80 || code === 81) return "rain";
  if (code === 66 || code === 67) return "sleet";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunderstorm";
  return "unknown";
}

const RAINY: WeatherCondition[] = ["drizzle", "rain", "heavy-rain", "thunderstorm", "sleet"];

export function isRainy(condition: WeatherCondition): boolean {
  return RAINY.includes(condition);
}

/** Short natural-Korean one-liner for the daily forecast list. */
export function koreanDailySummary(
  condition: WeatherCondition,
  rainProbability: number | null,
): string {
  const pop = rainProbability ?? 0;
  switch (condition) {
    case "thunderstorm":
      return "천둥·번개 동반 비";
    case "heavy-rain":
      return "강한 비, 외출 주의";
    case "rain":
      return pop >= 70 ? "하루 종일 비 소식" : "한때 비 소식";
    case "drizzle":
      return "약한 비 또는 이슬비";
    case "sleet":
      return "비 또는 눈";
    case "snow":
      return "눈 내림, 빙판길 주의";
    case "fog":
      return "안개 짙음, 시야 주의";
    case "overcast":
      return pop >= 40 ? "흐리고 비 올 수 있음" : "대체로 흐림";
    case "cloudy":
      return "구름 많은 하루";
    case "partly-cloudy":
      return "가끔 구름 지나감";
    case "clear":
      return "맑고 화창한 하루";
    default:
      return "예보 정보 없음";
  }
}
