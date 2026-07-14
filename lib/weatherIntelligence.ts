import { buildComparison, buildConfidence } from "./compare.ts";
import type {
  NormalizedAirQuality,
  NormalizedWarning,
  ProviderSnapshot,
  RadarSummary,
  WeatherIntelligence,
  WeatherProviderStatus,
} from "./types.ts";

export interface WeatherIntelligenceEnvironment {
  statuses: WeatherProviderStatus[];
  air: NormalizedAirQuality | null;
  radar: RadarSummary | null;
}

/**
 * The intelligence assembler depends on reads, not concrete upstream clients.
 * Provider read order is significant: the first live result is the primary.
 */
export interface WeatherIntelligenceDependencies {
  readonly providerReads: readonly (() => Promise<ProviderSnapshot>)[];
  getEnvironment(): Promise<WeatherIntelligenceEnvironment>;
  getWarnings(): Promise<NormalizedWarning[]>;
}

export interface WeatherIntelligenceOptions {
  now(): Date;
}

const emptyEnvironment: WeatherIntelligenceEnvironment = {
  statuses: [],
  air: null,
  radar: null,
};

async function readProviders(
  reads: WeatherIntelligenceDependencies["providerReads"],
): Promise<ProviderSnapshot[]> {
  const results = await Promise.all(
    reads.map(async (read) => {
      try {
        return await read();
      } catch {
        // Production provider reads already preserve failures as status rows.
        // This final guard keeps an unexpected adapter bug isolated as well.
        return null;
      }
    }),
  );
  return results.filter((snapshot): snapshot is ProviderSnapshot => snapshot !== null);
}

async function readEnvironment(
  read: WeatherIntelligenceDependencies["getEnvironment"],
): Promise<WeatherIntelligenceEnvironment> {
  try {
    return await read();
  } catch {
    return emptyEnvironment;
  }
}

async function readWarnings(
  read: WeatherIntelligenceDependencies["getWarnings"],
): Promise<NormalizedWarning[]> {
  try {
    return await read();
  } catch {
    return [];
  }
}

/** Assemble GET /api/weather independently from HTTP and concrete providers. */
export async function readWeatherIntelligence(
  dependencies: WeatherIntelligenceDependencies,
  options: WeatherIntelligenceOptions,
): Promise<WeatherIntelligence> {
  const [providers, environment, warnings] = await Promise.all([
    readProviders(dependencies.providerReads),
    readEnvironment(dependencies.getEnvironment),
    readWarnings(dependencies.getWarnings),
  ]);
  const live = providers.filter(
    (snapshot) => snapshot.status.availability === "ok" && snapshot.current !== null,
  );
  const comparison = buildComparison(live);

  return {
    generatedAt: options.now().toISOString(),
    providers,
    primaryId: live[0]?.id ?? null,
    comparison,
    confidence: buildConfidence(live, comparison),
    environment,
    warnings,
  };
}
