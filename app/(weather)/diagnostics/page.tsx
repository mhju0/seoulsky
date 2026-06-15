import type { Metadata } from "next";
import DiagnosticsView from "@/components/atmosphere/DiagnosticsView";

export const metadata: Metadata = {
  title: "SeoulSky — 데이터 덱",
  description: "소스 비교, 신뢰도 분석, 시스템 진단 — 살아있는 대기 색면 위에서",
};

export default function DiagnosticsPage() {
  return <DiagnosticsView />;
}
