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

  let headline = "예보가 대체로 비슷합니다";
  if (rain && rain.agreement < 65) headline = "비 예보가 서비스마다 다릅니다";
  else if (wind && wind.agreement < 65) headline = "바람 예보가 서비스마다 다릅니다";
  else if (temp && temp.agreement < 65) headline = "기온 예보가 서비스마다 다릅니다";
  else if (metrics.every((m) => m.agreement >= 80)) headline = "예보가 거의 같습니다";

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

/**
 * A neutral rain summary for today + the next few hours.
 *  • Sources agree → state the average chance without making a decision for the user.
 *  • Sources disagree → pivot to the most conservative reading.
 *  • Too few sources report precip → say so honestly; never invent a number.
 */
function rainRecommendation(
  rainAgreement: number | null,
  rainCmp: MetricComparison | undefined,
  nameOf: (id: ProviderId) => string,
): string {
  if (rainAgreement === null || !rainCmp) {
    return "비 예보를 비교하기에 데이터가 부족합니다. 기상청 예보를 함께 확인해 주세요.";
  }
  const consensus = Math.round(rainCmp.average);
  if (rainAgreement < 65) {
    // Sources disagree → lead with the most conservative (highest) reading.
    const worst = rainCmp.values.reduce((a, b) => (b.value > a.value ? b : a));
    return `서비스마다 비 예보가 다릅니다. 가장 높은 예보는 ${nameOf(worst.providerId)} ${Math.round(
      worst.value,
    )}%입니다.`;
  }
  return `향후 12시간 강수 확률은 평균 ${consensus}%입니다.`;
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
      recommendation: "날씨 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.",
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
      explanation: `현재 ${name} 예보만 확인했습니다. 다른 서비스와 비교할 수 없습니다.`,
      recommendation: `중요한 일정이 있다면 ${name}와 기상청 예보를 함께 확인해 주세요.`,
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
      ? `확인한 ${live.length}개 서비스의 강수, 기온, 바람 예보가 대체로 비슷합니다.`
      : level === "medium"
        ? "일부 항목은 서비스마다 차이가 있습니다. 평균값과 세부 비교를 함께 확인해 주세요."
        : "서비스마다 예보 차이가 큽니다. 외출 전 최신 예보를 다시 확인해 주세요.";

  return { overall, temperature: temp, rain, wind, level, explanation, recommendation };
}
