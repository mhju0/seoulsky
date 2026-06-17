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

/** Two clear umbrella states keyed to the consensus chance of rain. */
function umbrellaAdvice(consensus: number): { verdict: string; action: string } {
  if (consensus >= 50) return { verdict: "비 올 가능성 높음", action: "우산을 챙기세요." };
  if (consensus >= 30) return { verdict: "비 올 가능성 있음", action: "우산을 챙기세요." };
  if (consensus >= 15)
    return { verdict: "비 올 가능성 낮음", action: "우산은 없어도 될 듯하지만, 외출이 길면 챙겨두세요." };
  return { verdict: "비 올 가능성 낮음", action: "우산은 필요 없어 보입니다." };
}

/**
 * The rain-first answer to "지금 무엇을 믿어야 할까요?". Leads with the consensus
 * chance of rain for today + the next few hours, then a clear umbrella call.
 *  • Sources agree → state the chance + verdict + action (e.g. a unanimous ~5%
 *    reads "비 올 가능성 낮음 · 의견 일치. 우산은 필요 없어 보입니다.").
 *  • Sources disagree → pivot to the most conservative reading.
 *  • Too few sources report precip → say so honestly; never invent a number.
 */
function rainRecommendation(
  rainAgreement: number | null,
  rainCmp: MetricComparison | undefined,
  nameOf: (id: ProviderId) => string,
): string {
  if (rainAgreement === null || !rainCmp) {
    return "강수 데이터가 부족해 교차 검증이 어렵습니다. 우산 여부는 기상청 등 공식 채널에서 직접 확인하세요.";
  }
  const consensus = Math.round(rainCmp.average);
  if (rainAgreement < 65) {
    // Sources disagree → lead with the most conservative (highest) reading.
    const worst = rainCmp.values.reduce((a, b) => (b.value > a.value ? b : a));
    return `소스 간 강수 예보가 ${rainCmp.spread}%p 엇갈립니다 (합의 약 ${consensus}%). 가장 보수적인 ${nameOf(
      worst.providerId,
    )}의 ${Math.round(worst.value)}%를 기준으로, 우산을 챙기는 편이 안전합니다.`;
  }
  const { verdict, action } = umbrellaAdvice(consensus);
  return `오늘·향후 몇 시간 합의 강수 확률 약 ${consensus}% — ${verdict} · 의견 일치. ${action}`;
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
  const rainCmp = byMetric.get("rainProbability");
  const temp = byMetric.get("temperature")?.agreement ?? null;
  const rain = rainCmp?.agreement ?? null;
  const wind = byMetric.get("windSpeed")?.agreement ?? null;

  // Precipitation-led confidence. Rain agreement dominates the headline score
  // (temperature + wind are minor supporting signals) because "umbrella or not"
  // is the decision this page exists to answer. Crucially the score is built from
  // AGREEMENT — the spread between sources — never the rain VALUE: when every
  // source concurs on ~5% that is a high-confidence DRY forecast, not low
  // confidence. When too few sources report precip the score falls back to the
  // remaining metrics (and the bar/narrative flag the gap honestly).
  const parts: { score: number; weight: number }[] = [];
  if (rain !== null) parts.push({ score: rain, weight: 0.7 });
  if (temp !== null) parts.push({ score: temp, weight: 0.18 });
  if (wind !== null) parts.push({ score: wind, weight: 0.12 });
  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const overall = totalWeight
    ? Math.round(parts.reduce((a, p) => a + p.score * p.weight, 0) / totalWeight)
    : null;

  const level = overall === null ? "single-source" : overall >= 80 ? "high" : overall >= 60 ? "medium" : "low";

  const nameOf = (id: ProviderId) => live.find((s) => s.id === id)?.status.name ?? id;

  const recommendation = rainRecommendation(rain, rainCmp, nameOf);

  const explanation =
    level === "high"
      ? `${live.length}개 독립 소스의 예보가 잘 정렬되어 있습니다. 현재 예보의 신뢰도가 높습니다.`
      : level === "medium"
        ? "소스 간 일부 지표에서 편차가 관측됩니다. 핵심 수치는 평균값 기준으로 보는 것을 권장합니다."
        : "소스 간 예보가 크게 엇갈리고 있습니다. 변동성이 큰 기상 상황일 가능성이 높으니 보수적으로 판단하세요.";

  return { overall, temperature: temp, rain, wind, level, explanation, recommendation };
}
