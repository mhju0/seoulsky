import type { Metadata } from "next";
import DescentView from "@/components/atmosphere/DescentView";

export const metadata: Metadata = {
  title: "SeoulSky — 서울 대기 색면",
  description:
    "서울의 실시간 날씨가 색, 빛, 안개, 비, 눈으로 살아 움직이는 하나의 대기 색면 작품 — 상공에서 지상까지 하나의 스크롤로 내려갑니다",
};

/**
 * The Descent — ONE continuous vertical-scroll page over the single persistent
 * atmospheric field owned by {@link WeatherExperienceShell}. The field stays
 * `fixed` behind everything; the five descent bands flow in normal document
 * scroll (the document is the one scroll container). There is exactly one
 * `useLiveSeoulWeather()` fetch (in the shell) and one GL context (in the
 * layout); neither remounts on scroll, because nothing here navigates.
 */
export default function AtmospherePage() {
  return <DescentView />;
}
