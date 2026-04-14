import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 홈페이지 및 client 페이지의 HTML을 1년 정적 캐시로 내보내지 않도록
  // 클라이언트/CDN에 짧은 캐시만 적용
  async headers() {
    return [
      {
        // HTML 페이지 전반 (이미지/폰트/정적 asset 제외)
        source: "/:path((?!_next|api|.*\\.(?:png|jpg|jpeg|svg|webp|ico|gif|css|js|woff|woff2|ttf|map)).*)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, s-maxage=60, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
