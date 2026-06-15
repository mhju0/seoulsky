import type { ReactNode } from "react";
import WeatherExperienceShell from "@/components/atmosphere/WeatherExperienceShell";

/**
 * /sky — the single entry route for the whole experience. The shell owns the one
 * persistent atmospheric field (WebGL) and the single live-weather fetch, created
 * once here, so nothing remounts as the page scrolls.
 */
export default function SkyLayout({ children }: { children: ReactNode }) {
  return <WeatherExperienceShell>{children}</WeatherExperienceShell>;
}
