import type { WeatherProvider } from "./base";
import { kmaProvider } from "./kma.ts";
import { metNorwayProvider } from "./met-norway.ts";
import { openMeteoProvider } from "./open-meteo.ts";
import { pirateWeatherProvider } from "./pirate-weather.ts";
import { weatherApiProvider } from "./weather-api.ts";

/**
 * Order matters: the first live provider becomes the primary source that
 * drives the diagnostics hero. Open-Meteo first — free, keyless, reliable;
 * MET Norway second (keyless); KMA, Pirate Weather, WeatherAPI when keys
 * are configured.
 */
export const providers: WeatherProvider[] = [
  openMeteoProvider,
  metNorwayProvider,
  kmaProvider,
  pirateWeatherProvider,
  weatherApiProvider,
];

/**
 * Collect one provider's full state without ever throwing.
 * Data fetch happens once inside getProviderStatus() (shared TTL cache),
 * so the three getters afterwards are cache hits.
 */
