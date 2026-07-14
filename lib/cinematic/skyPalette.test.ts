import { test } from "node:test";
import assert from "node:assert/strict";

import type { WeatherCondition } from "../types.ts";
import { buildSkyPalette } from "./skyPalette.ts";

const CONDITIONS: WeatherCondition[] = [
  "clear",
  "partly-cloudy",
  "cloudy",
  "overcast",
  "fog",
  "drizzle",
  "rain",
  "heavy-rain",
  "snow",
  "sleet",
  "thunderstorm",
  "unknown",
];

const SUN_STATES = [
  { name: "night", isDay: false, dayFactor: 0, goldenFactor: 0 },
  { name: "dawn", isDay: false, dayFactor: 0.35, goldenFactor: 0.75 },
  { name: "morning", isDay: true, dayFactor: 0.65, goldenFactor: 0.35 },
  { name: "noon", isDay: true, dayFactor: 1, goldenFactor: 0 },
  { name: "dusk", isDay: false, dayFactor: 0.4, goldenFactor: 0.85 },
] as const;

test("all weather and sun states use one translucent adaptive surface token", () => {
  for (const condition of CONDITIONS) {
    for (const sun of SUN_STATES) {
      const palette = buildSkyPalette(
        sun.isDay,
        sun.dayFactor,
        sun.goldenFactor,
        condition,
      ) as Record<string, string>;

      assert.ok(
        palette["--sky-panel-bg"] === "rgba(248, 250, 255, 0.20)" ||
          palette["--sky-panel-bg"] === "rgba(12, 16, 30, 0.26)",
        `${condition}/${sun.name} produced an opaque panel surface`,
      );
      assert.equal(palette["--sky-data-surface-bg"], undefined);
      assert.equal(palette["--sky-data-surface-border"], undefined);
    }
  }
});
