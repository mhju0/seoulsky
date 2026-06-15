"use client";

import type { HourlyForecast } from "@/lib/types";
import AmbientMotes from "./core/AmbientMotes";
import CloudVolume from "./core/CloudVolume";
import CoreLight from "./core/CoreLight";
import ForecastOrbit from "./core/ForecastOrbit";
import GlassShell from "./core/GlassShell";
import PrecipitationField from "./core/PrecipitationField";
import TechnicalRings from "./core/TechnicalRings";
import TemperatureRibbon from "./core/TemperatureRibbon";
import ThermalSphere from "./core/ThermalSphere";

/**
 * The SEOUL ATMOSPHERIC CORE — the single interactive object, assembled from
 * modular layers that each react to the live atmosphere + the active chapter:
 *
 *   CoreLight        luminous nucleus (accent glow)
 *   ThermalSphere    inner body, warmth-coloured + expanding (ch2)
 *   CloudVolume      suspended interior vapour (ch4)
 *   PrecipitationField  rain/snow falling through the volume (ch4)
 *   GlassShell       translucent humidity-driven dome with a scan sweep (ch1)
 *   TechnicalRings   gyroscopic frame + wind compass (ch3)
 *   AmbientMotes     depth motes drifting in the chamber
 *   TemperatureRibbon  hourly temperature trend as an orbital ribbon (ch2)
 *   ForecastOrbit    next 12 hours orbiting the core (ch5)
 *
 * Two dim lights give the otherwise self-lit body a touch of form; everything
 * else carries its own emissive/additive look.
 */
export default function AtmosphericCore({ hourly }: { hourly: HourlyForecast[] }) {
  return (
    <group>
      <ambientLight intensity={0.28} />
      <directionalLight position={[4, 6, 5]} intensity={0.5} color={"#cdd7ee"} />

      <CoreLight />
      <ThermalSphere />
      <CloudVolume />
      <PrecipitationField />
      <GlassShell />
      <TechnicalRings />
      <AmbientMotes />
      <TemperatureRibbon hourly={hourly} />
      <ForecastOrbit hourly={hourly} />
    </group>
  );
}
