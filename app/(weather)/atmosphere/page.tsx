import type { Metadata } from "next";
import AtmosphereView from "@/components/atmosphere/AtmosphereView";

export const metadata: Metadata = {
  title: "SeoulSky — 서울 대기 색면",
  description:
    "서울의 실시간 날씨가 색, 빛, 안개, 비, 눈으로 살아 움직이는 하나의 대기 색면 작품",
};

export default function AtmospherePage() {
  return <AtmosphereView />;
}
