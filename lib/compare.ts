import type {
  ComparisonMetric,
  ConfidenceScore,
  MetricComparison,
  ProviderComparison,
  ProviderId,
  ProviderSnapshot,
} from "./types";

/**
 * Cross-provider comparison and confidence scoring.
 * Agreement is 100 minus a penalty proportional to the spread between
 * sources — tuned so that "normal model noise" scores ~75–90 and a real
 * disagreement (e.g. rain probabilities 40 points apart) lands below 65.
 */

const METRIC_LABELS_KO: Record<ComparisonMetric, string> = {
  temperature: "기온",
  rainProbability: "강수 확률",
  windSpeed: "바람",
  humidity: "습도",
};

/** Worst rain chance a provider sees in the next 12 hours. */
export function rainRiskNext12h(snapshot: ProviderSnapshot): number | null {
  const pops = snapshot.hourly
    .slice(0, 12)
    .map((h) => h.precipitationProbability)
    .filter((p): p is number => p !== null);
  return pops.length ? Math.max(...pops) : null;
}

function metricValue(snapshot: ProviderSnapshot, metric: ComparisonMetric): number | null {
  switch (metric) {
    case "temperature":
      return snapshot.current?.temperature ?? null;
    case "rainProbability":
      return rainRiskNext12h(snapshot);
    case "windSpeed":
      return snapshot.current?.windSpeed ?? null;
    case "humidity":
      return snapshot.current?.humidity ?? null;
  }
}

/** Penalty per unit of spread, per metric. */
const SPREAD_PENALTY: Record<ComparisonMetric, number> = {
  temperature: 15, // 2°C apart → 70
  rainProbability: 1.6, // 30%p apart → 52 (a real "umbrella or not" disagreement)
  windSpeed: 6, // 5 km/h apart → 70
  humidity: 1.5,
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function compareMetric(live: ProviderSnapshot[], metric: ComparisonMetric): MetricComparison | null {
  const values = live
    .map((s) => ({ providerId: s.id, value: metricValue(s, metric) }))
    .filter((v): v is { providerId: ProviderId; value: number } => v.value !== null);
  if (values.length < 2) return null;

  const nums = values.map((v) => v.value);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const spread = round1(max - min);
  return {
    metric,
    values,
    min: round1(min),
    max: round1(max),
    spread,
    average: round1(nums.reduce((a, b) => a + b, 0) / nums.length),
    agreement: clamp(100 - spread * SPREAD_PENALTY[metric]),
  };
}

function spreadText(m: MetricComparison): string {
  const unit =
    m.metric === "temperature" ? "°C" : m.metric === "windSpeed" ? " km/h" : "%p";
  return `${m.spread}${unit}`;
}

export function buildComparison(live: ProviderSnapshot[]): ProviderComparison | null {
  if (live.length < 2) return null;

  const metrics = (
    ["temperature", "rainProbability", "windSpeed", "humidity"] as const
  )
    .map((metric) => compareMetric(live, metric))
    .filter((m): m is MetricComparison => m !== null);

  const byMetric = new Map(metrics.map((m) => [m.metric, m]));
  const rain = byMetric.get("rainProbability");
  const temp = byMetric.get("temperature");
  const wind = byMetric.get("windSpeed");

  let headline = "예보 모델 대체로 일치";
  if (rain && rain.agreement < 65) headline = "강수 예보 불일치 감지";
  else if (wind && wind.agreement < 65) headline = "바람 예보 불확실성 감지";
  else if (temp && temp.agreement < 65) headline = "기온 모델 간 편차 발생";
  else if (metrics.every((m) => m.agreement >= 80)) headline = "모든 예보 모델 정렬됨";

  const notes = metrics.map(
    (m) =>
      `${METRIC_LABELS_KO[m.metric]}: 소스 간 최대 ${spreadText(m)} 차이 (일치도 ${m.agreement}%)`,
  );

  return {
    providersCompared: live.map((s) => s.id),
    metrics,
    headline,
    notes,
  };
}

export function buildConfidence(
  live: ProviderSnapshot[],
  comparison: ProviderComparison | null,
): ConfidenceScore {
  if (live.length === 0) {
    return {
      overall: null,
      temperature: null,
      rain: null,
      wind: null,
      level: "single-source",
      explanation: "활성화된 기상 소스가 없습니다. 네트워크 연결을 확인하세요.",
      recommendation: "데이터 수신이 복구될 때까지 기상청 등 공식 채널을 직접 확인하세요.",
    };
  }

  if (live.length === 1 || !comparison) {
    const name = live[0].status.name;
    return {
      overall: null,
      temperature: null,
      rain: null,
      wind: null,
      level: "single-source",
      explanation: `현재 ${name} 단일 소스로 운영 중입니다. 소스가 하나뿐이라 교차 검증은 불가능합니다.`,
      recommendation: `${name} 예보를 그대로 사용하되, .env에 기상청(KMA) API 키를 추가하면 공식 관측이 더해져 신뢰도 분석이 활성화됩니다.`,
    };
  }

  const byMetric = new Map(comparison.metrics.map((m) => [m.metric, m]));
  const temp = byMetric.get("temperature")?.agreement ?? null;
  const rain = byMetric.get("rainProbability")?.agreement ?? null;
  const wind = byMetric.get("windSpeed")?.agreement ?? null;

  const parts: { score: number; weight: number }[] = [];
  if (temp !== null) parts.push({ score: temp, weight: 0.4 });
  if (rain !== null) parts.push({ score: rain, weight: 0.4 });
  if (wind !== null) parts.push({ score: wind, weight: 0.2 });
  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const overall = totalWeight
    ? Math.round(parts.reduce((a, p) => a + p.score * p.weight, 0) / totalWeight)
    : null;

  const level = overall === null ? "single-source" : overall >= 80 ? "high" : overall >= 60 ? "medium" : "low";

  const nameOf = (id: ProviderId) => live.find((s) => s.id === id)?.status.name ?? id;

  // "지금 무엇을 믿어야 할까요?" — concrete, conservative advice.
  let recommendation: string;
  const rainCmp = byMetric.get("rainProbability");
  const tempCmp = byMetric.get("temperature");
  if (level === "high") {
    recommendation = `${live.length}개 소스가 거의 일치합니다. 어느 예보를 봐도 좋습니다${
      tempCmp ? ` — 합의 기온 약 ${Math.round(tempCmp.average)}°C` : ""
    }${rainCmp ? `, 강수 확률 ${Math.round(rainCmp.average)}%` : ""}.`;
  } else if (rain !== null && rain < 65 && rainCmp) {
    const worst = rainCmp.values.reduce((a, b) => (b.value > a.value ? b : a));
    recommendation = `강수 예보가 ${rainCmp.spread}%p 엇갈립니다. 우산은 가장 보수적인 ${nameOf(worst.providerId)}의 ${Math.round(worst.value)}%를 기준으로 판단하는 편이 안전합니다.`;
  } else if (temp !== null && temp < 65 && tempCmp) {
    recommendation = `기온 예측이 최대 ${tempCmp.spread}°C 벌어져 있습니다. 옷차림은 소스 평균인 ${Math.round(tempCmp.average)}°C를 기준으로 하되, 얇은 겉옷을 챙기세요.`;
  } else if (wind !== null && wind < 65) {
    recommendation = "바람 예보의 불확실성이 큽니다. 야외 활동 시 돌풍 가능성을 염두에 두세요.";
  } else {
    recommendation = `소스 간 약간의 편차가 있지만 큰 그림은 같습니다. 평균값${
      tempCmp ? ` (기온 ${Math.round(tempCmp.average)}°C)` : ""
    }을 기준으로 판단하면 충분합니다.`;
  }

  const explanation =
    level === "high"
      ? `${live.length}개 독립 소스의 예보가 잘 정렬되어 있습니다. 현재 예보의 신뢰도가 높습니다.`
      : level === "medium"
        ? "소스 간 일부 지표에서 편차가 관측됩니다. 핵심 수치는 평균값 기준으로 보는 것을 권장합니다."
        : "소스 간 예보가 크게 엇갈리고 있습니다. 변동성이 큰 기상 상황일 가능성이 높으니 보수적으로 판단하세요.";

  return { overall, temperature: temp, rain, wind, level, explanation, recommendation };
}
