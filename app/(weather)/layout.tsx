import type { ReactNode } from "react";
import WeatherExperienceShell from "@/components/atmosphere/WeatherExperienceShell";

/**
 * Shared shell for /atmosphere and /diagnostics. Because both routes live under
 * this single layout, the Atmospheric Color Field (WebGL) and the live weather
 * state are created once and persist across navigation between the two views —
 * the foreground swaps, the GL context does not.
 */
export default function WeatherLayout({ children }: { children: ReactNode }) {
  return <WeatherExperienceShell>{children}</WeatherExperienceShell>;
}
