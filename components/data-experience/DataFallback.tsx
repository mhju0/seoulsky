"use client";

import { useSeoulClock } from "@/hooks/useSeoulClock";
import { formatClock } from "@/lib/format";
import { computeSunPhase } from "@/lib/cinematic/seoulTime";
import { buildAtmosphericConfig, readAtmosphere, type RGB } from "@/lib/data-experience/atmosphericConfig";
import type { WeatherStatus } from "@/hooks/useLiveSeoulWeather";
import type { SkySnapshot } from "@/lib/types";

/**
 * Shown when WebGL is unavailable or the 3D scene fails. It keeps the same
 * identity — near-black, one weather-driven accent, the core motif — but renders
 * it in pure CSS: an accent gradient, concentric "instrument" rings, a glowing
 * centre with the live temperature, and a readable metric strip. Never a blank
 * page, raw error, or stuck loader.
 */
const ch = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);
const rgb = (c: RGB) => `${ch(c[0])}, ${ch(c[1])}, ${ch(c[2])}`;
const round = (n: number | null) => (n == null ? "—" : `${Math.round(n)}`);
const ms = (kmh: number | null) => (kmh == null ? "—" : (kmh / 3.6).toFixed(1));

function Metric({ k, v, unit }: { k: string; v: string; unit?: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] uppercase tracking-[0.24em] text-white/40">{k}</span>
      <span className="font-sans text-lg tabular-nums text-white/90">
        {v}
        {unit && <span className="ml-1 text-[10px] text-white/45">{unit}</span>}
      </span>
    </div>
  );
}

export default function DataFallback({
  snapshot,
  status,
}: {
  snapshot: SkySnapshot | null;
  status: WeatherStatus;
}) {
  const clock = useSeoulClock();
  const r = readAtmosphere(snapshot);
  const sun = computeSunPhase({
    now: clock ?? new Date(),
    sunrise: snapshot?.sun.sunrise,
    sunset: snapshot?.sun.sunset,
    isDayHint: snapshot?.current.isDay,
  });
  const cfg = buildAtmosphericConfig(sun, snapshot);
  const accent = rgb(cfg.accent);

  return (
    <main className="relative min-h-svh overflow-hidden bg-[#04060d] text-white">
      {/* accent wash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(60% 55% at 50% 42%, rgba(${accent}, 0.18), transparent 70%)` }}
      />
      {/* header */}
      <div className="absolute left-[6vw] top-[5vh]">
        <div className="text-[10px] uppercase tracking-[0.36em] text-white/45">SEOUL ATMOSPHERIC RECORD</div>
        <div className="mt-1.5 text-[10px] tabular-nums tracking-[0.18em] text-white/30">37.5665° N / 126.9780° E</div>
      </div>
      <div className="absolute right-[6vw] top-[5vh] text-right">
        <div className="font-sans text-lg tabular-nums tracking-wide text-white/85">
          {clock ? formatClock(clock) : "--:--:--"}
        </div>
        <div className="mt-1 text-[11px] text-white/55">{r.conditionKo}</div>
      </div>

      {/* centre core motif */}
      <div className="flex min-h-svh flex-col items-center justify-center px-6">
        <div className="relative flex h-[68vmin] w-[68vmin] max-w-[420px] items-center justify-center">
          {[1, 0.78, 0.56].map((s, i) => (
            <div
              key={i}
              className="absolute rounded-full border"
              style={{
                inset: `${(1 - s) * 50}%`,
                borderColor: `rgba(${accent}, ${0.18 - i * 0.03})`,
              }}
            />
          ))}
          <div
            className="absolute h-[48%] w-[48%] rounded-full blur-2xl"
            style={{ background: `radial-gradient(circle, rgba(${accent}, 0.5), transparent 70%)` }}
          />
          <div className="relative text-center">
            <div className="font-sans text-7xl font-semibold leading-none tabular-nums text-white/95">
              {round(r.temperature)}°
            </div>
            <div className="mt-2 text-sm tracking-wide text-white/60">{r.conditionKo}</div>
          </div>
        </div>

        {/* metric strip */}
        <div className="mt-10 grid grid-cols-3 gap-x-10 gap-y-6 sm:grid-cols-5">
          <Metric k="체감" v={round(r.apparentTemperature)} unit="°" />
          <Metric k="바람" v={ms(r.windSpeed)} unit="M/S" />
          <Metric k="습도" v={round(r.humidity)} unit="%" />
          <Metric k="구름" v={round(r.cloudCover)} unit="%" />
          <Metric k="강수" v={round(r.precipitationProbability)} unit="%" />
        </div>

        <div className="mt-10 text-[10px] uppercase tracking-[0.3em] text-white/30">
          {status === "error" ? "최근 캐시 데이터" : "정적 관측 모드"}
        </div>
      </div>
    </main>
  );
}
