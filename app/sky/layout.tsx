import type { ReactNode } from "react";
import WeatherExperienceShell from "@/components/atmosphere/WeatherExperienceShell";

/**
 * /sky — the single entry route for the whole experience. The shell owns the one
 * persistent atmospheric field (WebGL) and the single live-weather fetch, created
 * once here, so nothing remounts as the page scrolls.
 *
 * The live scene + HUD are inherently client-driven (capability detection, the
 * weather fetch, scroll motion). For no-JS visitors and crawlers the shell can
 * only render its loader, so this layout — a server component, always present in
 * the SSR HTML — carries a <noscript> fallback with the meaningful, static
 * content: what SeoulSky is, the four readings it shows, and the data sources.
 */
export default function SkyLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <WeatherExperienceShell>{children}</WeatherExperienceShell>

      <noscript>
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1.25rem",
            padding: "2rem",
            textAlign: "center",
            background: "#04060d",
            color: "#e2e8f0",
            fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
          }}
        >
          <p style={{ fontSize: "0.7rem", letterSpacing: "0.4em", textTransform: "uppercase", color: "#94a3b8" }}>
            Seoul · 서울
          </p>
          <h1 style={{ fontSize: "clamp(1.8rem, 6vw, 3rem)", fontWeight: 300, margin: 0 }}>
            SeoulSky — 서울 하늘
          </h1>
          <p style={{ maxWidth: "40ch", lineHeight: 1.7, color: "#cbd5e1", margin: 0 }}>
            실시간 서울 날씨를, 그 날씨 속 서울 명소의 시네마틱 영상 위에 떠 있는 HUD로 —
            도착부터 지상 관측소까지 하나의 스크롤로 보여줍니다.
          </p>
          <p style={{ fontSize: "0.85rem", letterSpacing: "0.18em", color: "#94a3b8", margin: 0 }}>
            도착 · 계기 · 예보 · 지상 관측소
          </p>
          <p style={{ maxWidth: "44ch", fontSize: "0.8rem", lineHeight: 1.7, color: "#7c8aa0", margin: 0 }}>
            라이브 경험을 보려면 JavaScript를 켜 주세요. 데이터: Open-Meteo · MET Norway
            {" / "}선택: 기상청(KMA) · 대기질: AirKorea · 레이더: 기상청(KMA).
          </p>
        </div>
      </noscript>
    </>
  );
}
