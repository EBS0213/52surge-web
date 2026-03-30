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

export const metadata: Metadata = {
  title: "Unimind | 52주 신고가 추적",
  description: "시가총액 상위 1,000개 종목의 52주 신고가를 실시간으로 추적합니다",
  openGraph: {
    title: "Unimind | 52주 신고가 추적",
    description: "시가총액 상위 1,000개 종목의 52주 신고가를 실시간으로 추적합니다",
    siteName: "Unimind",
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
