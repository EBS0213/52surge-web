import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 정적 prerender 방지 — 모든 페이지를 동적으로 렌더링 (배포 즉시 반영)
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "OURTLE | 52주 신고가 추적",
  description: "52주 신고가를 실시간으로 추적합니다",
  openGraph: {
    title: "OURTLE | 52주 신고가 추적",
    description: "52주 신고가를 실시간으로 추적합니다",
    siteName: "OURTLE",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
