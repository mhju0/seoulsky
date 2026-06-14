import type { WeatherCondition } from "@/lib/types";

/**
 * Minimal line-style weather glyphs (path data based on Lucide, ISC license).
 * No image assets — pure inline SVG, colored via currentColor.
 */

interface Props {
  condition: WeatherCondition;
  night?: boolean;
  className?: string;
}

const CLOUD_HIGH = "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242";

const PATHS: Record<string, string[]> = {
  sun: [
    "M12 2v2",
    "M12 20v2",
    "m4.93 4.93 1.41 1.41",
    "m17.66 17.66 1.41 1.41",
    "M2 12h2",
    "M20 12h2",
    "m6.34 17.66-1.41 1.41",
    "m19.07 4.93-1.41 1.41",
  ],
  moon: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"],
  cloud: ["M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"],
  cloudy: [
    "M17.5 21H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z",
    "M22 10a3 3 0 0 0-3-3h-2.207a5.502 5.502 0 0 0-10.702.5",
  ],
  cloudSun: [
    "M12 2v2",
    "m4.93 4.93 1.41 1.41",
    "M20 12h2",
    "m19.07 4.93-1.41 1.41",
    "M15.947 12.65a4 4 0 0 0-5.925-4.128",
    "M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z",
  ],
  cloudMoon: [
    "M13 16a3 3 0 1 1 0 6H7a5 5 0 1 1 4.9-6Z",
    "M10.1 9A6 6 0 0 1 16 4a4.24 4.24 0 0 0 6 6 6 6 0 0 1-3 5.197",
  ],
  rain: [CLOUD_HIGH, "M16 14v6", "M8 14v6", "M12 16v6"],
  heavyRain: [CLOUD_HIGH, "M16 14v7", "M8 14v7", "M12 16v7", "M4.5 16v5"],
  drizzle: [CLOUD_HIGH, "M8 19v1", "M8 14v1", "M16 19v1", "M16 14v1", "M12 21v1", "M12 16v1"],
  snow: [CLOUD_HIGH, "M8 15h.01", "M8 19h.01", "M12 17h.01", "M12 21h.01", "M16 15h.01", "M16 19h.01"],
  sleet: [CLOUD_HIGH, "M8 14v6", "M12 17h.01", "M16 14v6", "M12 21h.01"],
  thunder: [CLOUD_HIGH, "m13 12-3 5h4l-3 5"],
  fog: ["M17.5 17H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 0 1 0 9Z", "M7 21h10", "M5 18h2"],
  unknown: ["M12 17h.01", "M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3", "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z"],
};

function iconKey(condition: WeatherCondition, night: boolean): string {
  switch (condition) {
    case "clear":
      return night ? "moon" : "sun";
    case "partly-cloudy":
      return night ? "cloudMoon" : "cloudSun";
    case "cloudy":
      return "cloudy";
    case "overcast":
      return "cloud";
    case "fog":
      return "fog";
    case "drizzle":
      return "drizzle";
    case "rain":
      return "rain";
    case "heavy-rain":
      return "heavyRain";
    case "snow":
      return "snow";
    case "sleet":
      return "sleet";
    case "thunderstorm":
      return "thunder";
    default:
      return "unknown";
  }
}

export default function WeatherIcon({ condition, night = false, className }: Props) {
  const key = iconKey(condition, night);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {key === "sun" && <circle cx={12} cy={12} r={4} />}
      {PATHS[key].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
