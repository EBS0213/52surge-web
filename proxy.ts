import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * HTML 페이지 응답의 Cache-Control을 강제로 짧게 오버라이드.
 * Next.js가 prerender된 정적 페이지에 s-maxage=31536000을 박아버리는 문제 해결.
 */
export function proxy(req: NextRequest) {
  const res = NextResponse.next();

  const url = req.nextUrl.pathname;
  // HTML 경로에만 적용 (_next/static, api, 정적 에셋 제외)
  if (
    !url.startsWith("/_next") &&
    !url.startsWith("/api") &&
    !/\.(png|jpg|jpeg|svg|webp|ico|gif|css|js|woff|woff2|ttf|map)$/.test(url)
  ) {
    res.headers.set(
      "Cache-Control",
      "public, max-age=0, s-maxage=60, must-revalidate"
    );
  }

  return res;
}

export const config = {
  matcher: [
    // 모든 경로 매칭 (_next/static, _next/image, favicon 제외)
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
