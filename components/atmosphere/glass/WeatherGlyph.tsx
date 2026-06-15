import type { WeatherCondition } from "@/lib/types";

/**
 * A minimal, hairline weather icon — thin strokes in `currentColor`, no fill — so
 * it sits as a quiet instrument mark inside the glass forecast tiles rather than a
 * coloured app sticker. One compact SVG composes a few shared primitives (sun,
 * moon, cloud, precipitation) per {@link WeatherCondition}, with a day/night
 * variant for the clear/partly-cloudy faces.
 */

const SUN = (
  <g>
    <circle cx="12" cy="12" r="3.4" />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
      const a = (deg * Math.PI) / 180;
      return (
        <line
          key={deg}
          x1={12 + Math.cos(a) * 5.4}
          y1={12 + Math.sin(a) * 5.4}
          x2={12 + Math.cos(a) * 7.2}
          y2={12 + Math.sin(a) * 7.2}
        />
      );
    })}
  </g>
);

const MOON = <path d="M16.5 14.2A5.6 5.6 0 0 1 10 7.7a5.6 5.6 0 1 0 6.5 6.5z" />;

/** A soft rounded cloud, drawn low so precipitation can fall beneath it. */
const CLOUD = (
  <path d="M7.2 16.5h8.4a3.1 3.1 0 0 0 .3-6.18 4.5 4.5 0 0 0-8.46-1.2A3.4 3.4 0 0 0 7.2 16.5z" />
);

function Drops({ heavy = false }: { heavy?: boolean }) {
  const xs = heavy ? [8, 11, 14, 17] : [9.5, 13.5];
  return (
    <g>
      {xs.map((x) => (
        <line key={x} x1={x} y1="18.4" x2={x - 1} y2="21" />
      ))}
    </g>
  );
}

function Flakes() {
  return (
    <g>
      {[9.5, 13.5].map((x) => (
        <g key={x}>
          <line x1={x} y1="18.6" x2={x} y2="21.4" />
          <line x1={x - 1.3} y1="20" x2={x + 1.3} y2="20" />
        </g>
      ))}
    </g>
  );
}

export default function WeatherGlyph({
  condition,
  night = false,
  className = "",
  size = 22,
}: {
  condition: WeatherCondition;
  night?: boolean;
  className?: string;
  size?: number;
}) {
  let inner: React.ReactNode;

  switch (condition) {
    case "clear":
      inner = night ? MOON : SUN;
      break;
    case "partly-cloudy":
      inner = (
        <g>
          <g transform="translate(2.5 -2.5) scale(0.62)">{night ? MOON : SUN}</g>
          {CLOUD}
        </g>
      );
      break;
    case "cloudy":
    case "overcast":
      inner = CLOUD;
      break;
    case "fog":
      inner = (
        <g>
          {CLOUD}
          <line x1="6.5" y1="19.4" x2="15" y2="19.4" />
          <line x1="8.5" y1="21.4" x2="17.5" y2="21.4" />
        </g>
      );
      break;
    case "drizzle":
      inner = (
        <g>
          {CLOUD}
          <Drops />
        </g>
      );
      break;
    case "rain":
    case "heavy-rain":
      inner = (
        <g>
          {CLOUD}
          <Drops heavy />
        </g>
      );
      break;
    case "snow":
      inner = (
        <g>
          {CLOUD}
          <Flakes />
        </g>
      );
      break;
    case "sleet":
      inner = (
        <g>
          {CLOUD}
          <line x1="9.5" y1="18.4" x2="8.5" y2="21" />
          <line x1="13.5" y1="18.6" x2="13.5" y2="21.4" />
          <line x1="12.2" y1="20" x2="14.8" y2="20" />
        </g>
      );
      break;
    case "thunderstorm":
      inner = (
        <g>
          {CLOUD}
          <path d="M12.5 17.8l-2 3.1h2.2l-1.4 2.6" />
        </g>
      );
      break;
    default:
      inner = <line x1="8" y1="12" x2="16" y2="12" />;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {inner}
    </svg>
  );
}
