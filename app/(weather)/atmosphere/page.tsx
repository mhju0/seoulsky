import type { Metadata } from "next";
import AtmosphereView from "@/components/atmosphere/AtmosphereView";
import DiagnosticsView from "@/components/atmosphere/DiagnosticsView";

export const metadata: Metadata = {
  title: "SeoulSky — 서울 대기 색면",
  description:
    "서울의 실시간 날씨가 색, 빛, 안개, 비, 눈으로 살아 움직이는 하나의 대기 색면 작품 — 상공에서 지상까지 하나의 스크롤로 내려갑니다",
};

/**
 * The Descent — ONE continuous vertical-scroll page over the single persistent
 * atmospheric field owned by {@link WeatherExperienceShell}. The field stays
 * `fixed` behind everything; the foreground content flows in normal document
 * scroll (the document is the one scroll container). For now this simply stacks
 * the existing atmosphere foreground over the diagnostics data deck — the real
 * five descent bands arrive in Phase 3. There is still exactly one
 * `useLiveSeoulWeather()` fetch (in the shell) and one GL context (in the
 * layout); neither remounts on scroll, because nothing here navigates.
 */
export default function AtmospherePage() {
  return (
    <div className="relative">
      <AtmosphereView />
      <DiagnosticsView />
    </div>
  );
}
