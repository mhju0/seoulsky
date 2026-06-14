"use client";

import { useMemo } from "react";
import { mulberry32 } from "@/lib/random";

/**
 * Rain streaks, snow flakes, twinkling stars. All CSS-animated divs with
 * seeded randomness. The rain layer tilts with wind speed for drama.
 */

interface Props {
  rain: number;
  snow: number;
  stars: number;
  windKmh: number;
}

export default function WeatherParticles({ rain, snow, stars, windKmh }: Props) {
  const drops = useMemo(() => {
    const rand = mulberry32(7);
    return Array.from({ length: rain }, () => ({
      left: rand() * 100,
      delay: rand() * 1.6,
      duration: 0.9 + rand() * 0.7,
      height: 55 + rand() * 55,
      opacity: 0.22 + rand() * 0.45,
    }));
  }, [rain]);

  const flakes = useMemo(() => {
    const rand = mulberry32(13);
    return Array.from({ length: snow }, () => ({
      left: rand() * 100,
      delay: rand() * 9,
      duration: 7 + rand() * 6,
      size: 2 + rand() * 3,
      opacity: 0.3 + rand() * 0.5,
    }));
  }, [snow]);

  const starField = useMemo(() => {
    const rand = mulberry32(42);
    return Array.from({ length: stars }, () => ({
      left: rand() * 100,
      top: rand() * 55,
      delay: rand() * 5,
      duration: 2.5 + rand() * 4,
      min: 0.08 + rand() * 0.3,
    }));
  }, [stars]);

  const rainAngle = Math.min(16, 4 + windKmh * 0.4);

  return (
    <>
      {stars > 0 && (
        <div className="absolute inset-0">
          {starField.map((s, i) => (
            <span
              key={i}
              className="star"
              style={
                {
                  left: `${s.left}%`,
                  top: `${s.top}%`,
                  "--twinkle-delay": `${s.delay}s`,
                  "--twinkle-duration": `${s.duration}s`,
                  "--star-min": s.min,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      {rain > 0 && (
        <div
          className="absolute -inset-[12%]"
          style={{ transform: `rotate(${rainAngle}deg)` }}
        >
          {drops.map((d, i) => (
            <span
              key={i}
              className="rain-drop"
              style={
                {
                  left: `${d.left}%`,
                  height: `${d.height}px`,
                  opacity: d.opacity,
                  "--fall-duration": `${d.duration}s`,
                  "--fall-delay": `-${d.delay}s`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      {snow > 0 &&
        flakes.map((f, i) => (
          <span
            key={i}
            className="snow-flake"
            style={
              {
                left: `${f.left}%`,
                width: `${f.size}px`,
                height: `${f.size}px`,
                opacity: f.opacity,
                "--fall-duration": `${f.duration}s`,
                "--fall-delay": `-${f.delay}s`,
              } as React.CSSProperties
            }
          />
        ))}
    </>
  );
}
