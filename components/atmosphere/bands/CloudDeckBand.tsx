"use client";

import { useWeatherField } from "../WeatherFieldContext";
import { Metric } from "../EtchedType";
import { ScrollReveal } from "../descentMotion";
import BandHeading from "./BandHeading";

/**
 * Band 3 — Cloud Deck. The layer you pass into: how much sky is filled, how far
 * you can see, and how heavy the air is. The field's mid-scroll haze peak runs in
 * parallel with this band (driven by its own scroll ref, not by this component).
 */

const round = (n: number | null) => (n == null ? "—" : `${Math.round(n)}`);

export default function CloudDeckBand() {
  const { readout, snapshot } = useWeatherField();

  const cloudCover = snapshot?.current.cloudCover ?? null;
  const visKm = readout.visibility == null ? "—" : `${Math.round(readout.visibility / 1000)}`;

  return (
    <ScrollReveal className="max-w-[760px]">
      <BandHeading index="03" en="Cloud Deck" ko="구름층" />
      <div className="flex flex-wrap gap-x-14 gap-y-10">
        <Metric
          label="Cloud Cover"
          value={round(cloudCover)}
          unit={cloudCover == null ? undefined : "%"}
          size="lg"
        />
        <Metric label="Visibility" value={visKm} unit={visKm === "—" ? undefined : "km"} size="lg" />
        <Metric
          label="Humidity"
          value={round(readout.humidity)}
          unit={readout.humidity == null ? undefined : "%"}
          size="lg"
        />
      </div>
    </ScrollReveal>
  );
}
