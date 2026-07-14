import { NextResponse } from "next/server";
import { buildComparison, buildConfidence } from "@/lib/compare";
import { airQualityStatuses, getFusedAirQuality } from "@/lib/providers/air-quality";
import { getKmaWarningStatus, kmaProvider } from "@/lib/providers/kma";
import { getRadarSummary, radarStatus } from "@/lib/providers/radar";
import { readProviderSnapshot } from "@/lib/providers/read";
import { providers } from "@/lib/providers/registry";
import type { NormalizedWarning, WeatherIntelligence } from "@/lib/types";

export const dynamic = "force-dynamic";

async function warningsOrEmpty(): Promise<NormalizedWarning[]> {
  try {
    return (await kmaProvider.getWarnings?.()) ?? [];
  } catch {
    return [];
  }
}

export async function GET() {
  const [snapshots, air, radar, envStatuses, warningStatus, warnings] = await Promise.all([
    Promise.all(providers.map(readProviderSnapshot)),
    getFusedAirQuality(),
    getRadarSummary(),
    airQualityStatuses(),
    getKmaWarningStatus(),
    warningsOrEmpty(),
  ]);
  const live = snapshots.filter((s) => s.status.availability === "ok" && s.current !== null);
  const comparison = buildComparison(live);
  const confidence = buildConfidence(live, comparison);

  // Hero display prefers the registry order (Open-Meteo first, then MET Norway, …).
  const primaryId = live[0]?.id ?? null;

  const payload: WeatherIntelligence = {
    generatedAt: new Date().toISOString(),
    providers: snapshots,
    primaryId,
    comparison,
    confidence,
    environment: {
      statuses: [...envStatuses, warningStatus, await radarStatus()],
      air,
      radar,
    },
    warnings,
  };

  return NextResponse.json(payload);
}
