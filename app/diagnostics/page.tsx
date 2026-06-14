import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";

export const metadata: Metadata = {
  title: "SeoulSky — 데이터 덱",
  description: "소스 비교, 신뢰도 분석, 시스템 진단",
};

export default function DiagnosticsPage() {
  return <Dashboard />;
}
