import type { Metadata, Viewport } from "next";
import { Geist, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-kr",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "서울의 하늘 — 오늘의 서울 날씨",
  description: "서울의 현재 날씨, 시간별 예보, 레이더와 예보 신뢰도를 확인하세요.",
};

export const viewport: Viewport = {
  themeColor: "#04060d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${notoSansKr.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
