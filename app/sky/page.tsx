import type { Metadata } from "next";
import SkyView from "@/components/atmosphere/SkyView";

export const metadata: Metadata = {
  title: "서울의 하늘 — 지금 서울의 날씨",
  description: "서울의 현재 날씨, 시간별 예보, 레이더와 예보 신뢰도를 확인하세요.",
};

/**
 * /sky — ONE continuous vertical-scroll page. The HUD ({@link SkyView}) floats in
 * normal document scroll over the single persistent {@link SceneStage}
 * (edge-to-edge still color-field plate + FX + procedural fallback) owned by
 * {@link WeatherExperienceShell}. There is exactly one `useLiveSeoulWeather()`
 * fetch (in the shell) and one GL context (in the layout); neither remounts on
 * scroll, because nothing here navigates.
 */
export default function SkyPage() {
  return <SkyView />;
}
