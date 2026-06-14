/**
 * One concise, deterministic Korean line for the overlay, derived from the
 * real Seoul sun-phase + current weather. No AI call, no randomness — the same
 * data always yields the same sentence. Priority: dramatic weather → strong
 * wind → overcast → time-of-day mood.
 */

import { windDirectionKo } from "@/lib/format";
import type { SkyRadar } from "@/lib/types";
import type { SceneWeather } from "./weatherSceneConfig";
import type { SunPhase, SunPhaseName } from "./seoulTime";

const PHASE_LINE: Record<SunPhaseName, string> = {
  "deep-night": "깊은 밤, 도시의 불빛만이 구름 아래에서 깨어 있습니다",
  night: "달빛이 흐린 구름의 윤곽을 조용히 드러냅니다",
  "pre-dawn": "새벽빛이 서울의 구름 가장자리에서 번지고 있습니다",
  sunrise: "아침 해가 도시의 능선 위로 천천히 떠오릅니다",
  "early-morning": "맑은 아침 공기가 도시 위로 가볍게 퍼집니다",
  daytime: "맑은 공기 너머로 서울의 능선이 멀리 열립니다",
  "late-afternoon": "오후의 빛이 구름 위로 길게 누워 있습니다",
  "golden-hour": "황금빛이 구름 사이로 도시 위에 내려앉습니다",
  sunset: "저녁빛이 구름 사이로 도시 위에 번집니다",
  "blue-hour": "푸른 어스름이 도시의 불빛을 하나씩 깨웁니다",
};

const STAR_NIGHT = "별빛 아래 서울의 하늘이 깊고 선명하게 가라앉아 있습니다";

export function poeticSkyLine(sun: SunPhase, w: SceneWeather, radar?: SkyRadar | null): string {
  const night = !sun.isDay;

  // 1. Dramatic weather always leads.
  switch (w.condition) {
    case "fog":
      return "도시의 불빛이 짙은 안개 아래로 희미하게 잠겨 있습니다";
    case "drizzle":
      return night
        ? "가는 비가 도시의 밤공기 속으로 조용히 스며듭니다"
        : "가는 비가 도시의 공기 속으로 부드럽게 번집니다";
    case "rain":
      return night
        ? "비구름이 서울의 밤을 낮게 지나고 있습니다"
        : "비가 도시의 하늘을 천천히 적시며 지나갑니다";
    case "heavy-rain":
      return "굵은 비가 도시 위로 무겁게 쏟아져 내립니다";
    case "thunderstorm":
      return "먼 번개가 구름 깊은 곳을 잠시 환하게 밝힙니다";
    case "snow":
      return night
        ? "눈송이가 가로등 불빛 사이를 느리게 떠돕니다"
        : "눈이 도시의 하늘을 천천히 하얗게 채웁니다";
    case "sleet":
      return "비와 눈이 경계 없이 도시 위로 흩날립니다";
    default:
      break;
  }

  // 1.5 Observed radar shows rain approaching — only when the frame analysis
  // actually supports it (direction is never fabricated).
  if (radar?.approaching && radar.fromDirection) {
    return `${radar.fromDirection}쪽의 비구름이 서울 쪽으로 천천히 다가오고 있습니다`;
  }

  // 2. Rain on the way, even under a still-dry sky.
  if (w.precipitationProbability >= 60) {
    return "비를 머금은 구름이 도시 쪽으로 천천히 다가오고 있습니다";
  }

  // 3. A genuinely windy sky.
  if (w.windSpeed >= 22) {
    const dir = windDirectionKo(w.windDirection);
    return dir
      ? `${dir}쪽 높은 바람이 도시 위의 구름을 느리게 밀어냅니다`
      : "높은 바람이 도시 위의 구름을 느리게 밀어냅니다";
  }

  // 3.5 Bad/very-bad air (PM band 3–4) dominates the look on an otherwise calm sky.
  if (w.airBand === 4) {
    return night
      ? "짙은 미세먼지가 도시의 불빛을 뿌옇게 머금고 있습니다"
      : "짙은 미세먼지가 도시의 윤곽을 흐릿하게 지웁니다";
  }
  if (w.airBand === 3) {
    return "미세먼지가 도시 위에 옅은 막을 드리웁니다";
  }

  // 4. Cloud-led lines when the sky is filled in.
  if (w.condition === "overcast") {
    return night
      ? "두꺼운 구름이 도시의 밤하늘을 낮게 덮고 있습니다"
      : "낮게 드리운 구름이 도시 위로 두껍게 깔려 있습니다";
  }
  if (w.condition === "cloudy") {
    return "구름이 천천히 도시 위를 흘러 지나갑니다";
  }
  if (w.condition === "partly-cloudy") {
    return night
      ? "구름 사이로 달빛이 도시 위에 스며듭니다"
      : "구름 사이로 빛이 드나들며 도시를 비춥니다";
  }

  // 5. Moderate air (band 2) lightly softens an otherwise clear sky.
  if (w.airBand === 2) {
    return "옅은 먼지가 도시의 윤곽을 부드럽게 흐리고 있습니다";
  }

  // 6. Clear skies fall back to the time-of-day mood.
  if (sun.phase === "deep-night" || sun.phase === "night") return STAR_NIGHT;
  return PHASE_LINE[sun.phase];
}
