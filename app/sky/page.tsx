import type { Metadata } from "next";
import SkyView from "@/components/atmosphere/SkyView";

export const metadata: Metadata = {
  title: "SeoulSky — 서울 하늘",
  description:
    "실시간 서울 날씨를, 그 날씨 속 서울 명소의 시네마틱 영상 위에 떠 있는 리퀴드 글래스 HUD로 — 도착부터 지상 관측소까지 하나의 스크롤로",
};

/**
 * /sky — ONE continuous vertical-scroll page. The liquid-glass HUD ({@link SkyView})
 * floats in normal document scroll over the single persistent {@link SceneStage}
 * (edge-to-edge shuffling video gallery + FX + procedural fallback) owned by
 * {@link WeatherExperienceShell}. There is exactly one `useLiveSeoulWeather()`
 * fetch (in the shell) and one GL context (in the layout); neither remounts on
 * scroll, because nothing here navigates.
 */
export default function SkyPage() {
  return <SkyView />;
}
