"use client";

import { useWeatherField } from "../WeatherFieldContext";
import { Metric } from "../EtchedType";
import { ScrollReveal } from "../descentMotion";
import BandHeading from "./BandHeading";

/**
 * Band 2 — Upper Air. The dynamics of the air you are falling through: wind
 * (speed + bearing), gusts, and the felt temperature. Pressure is intentionally
 * absent — the shared live snapshot (/api/sky) carries no surface pressure, and
 * the handoff forbids fabricating data, so the band shows only true readings.
 */

const round = (n: number | null) => (n == null ? "—" : `${Math.round(n)}`);
/** km/h → m/s, matching the rest of the experience. */
const toMs = (kmh: number | null) => (kmh == null ? "—" : (kmh / 3.6).toFixed(1));

export default function UpperAirBand() {
  const { readout, snapshot } = useWeatherField();

  const windMs = toMs(readout.windSpeed);
  const gustMs = toMs(snapshot?.current.windGusts ?? null);
  const feels = readout.apparentTemperature;

  const windSub =
    readout.windDirection == null
      ? readout.windDirectionKo || null
      : `${readout.windDirectionKo} ${Math.round(readout.windDirection)}°`.trim();

  return (
    <ScrollReveal className="max-w-[760px]">
      <BandHeading index="02" en="Upper Air" ko="상층 대기" />
      <div className="flex flex-wrap gap-x-14 gap-y-10">
        <Metric
          label="Wind"
          value={windMs}
          unit={windMs === "—" ? undefined : "m/s"}
          sub={windSub}
          size="lg"
        />
        <Metric label="Gusts" value={gustMs} unit={gustMs === "—" ? undefined : "m/s"} size="lg" />
        <Metric
          label="Feels Like"
          value={round(feels)}
          unit={feels == null ? undefined : "°"}
          size="lg"
        />
      </div>
    </ScrollReveal>
  );
}
