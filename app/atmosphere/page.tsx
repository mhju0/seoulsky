import type { Metadata } from "next";
import AtmosphericDataPage from "@/components/data-experience/AtmosphericDataPage";

export const metadata: Metadata = {
  title: "SeoulSky — 서울 대기 코어",
  description:
    "서울의 실시간 대기를 하나의 3D 관측 코어로 풀어내는 스크롤 기반 데이터 경험",
};

export default function AtmospherePage() {
  return <AtmosphericDataPage />;
}
