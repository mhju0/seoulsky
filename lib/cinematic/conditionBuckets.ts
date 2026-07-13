import type { WeatherCondition } from "../types.ts";

/** Coarse weather buckets shared by the still-image manifest and selector. */
export type ImageCondition =
  | "clear"
  | "partly-cloudy"
  | "overcast"
  | "rain"
  | "snow"
  | "fog";

export function toImageCondition(condition: WeatherCondition): ImageCondition | null {
  switch (condition) {
    case "clear":
      return "clear";
    case "partly-cloudy":
      return "partly-cloudy";
    case "cloudy":
    case "overcast":
      return "overcast";
    case "fog":
      return "fog";
    case "drizzle":
    case "rain":
    case "heavy-rain":
    case "thunderstorm":
    case "sleet":
      return "rain";
    case "snow":
      return "snow";
    case "unknown":
    default:
      return null;
  }
}

export const RELATED_IMAGE_CONDITIONS: Record<ImageCondition, ImageCondition[]> = {
  clear: ["clear", "partly-cloudy", "overcast"],
  "partly-cloudy": ["partly-cloudy", "clear", "overcast"],
  overcast: ["overcast", "partly-cloudy", "clear"],
  rain: ["rain"],
  fog: ["fog", "overcast"],
  snow: ["snow", "overcast"],
};

export const DRY_IMAGE_CONDITIONS: readonly ImageCondition[] = ["clear", "partly-cloudy"];
export const PRECIP_IMAGE_CONDITIONS: readonly ImageCondition[] = ["snow", "rain"];
