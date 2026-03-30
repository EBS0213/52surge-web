import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://13.124.156.73:8000';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분 캐시

// 인메모리 캐시
let cachedData: { data: unknown; timestamp: number; key: string } | null = null;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const maxResults = searchParams.get('max_results') || '20';
  const cacheKey = `scan-${maxResults}`;

  // 캐시 히트 확인
  if (
    cachedData &&
    cachedData.key === cacheKey &&
    Date.now() - cachedData.timestamp < CACHE_TTL_MS
  ) {
    return NextResponse.json(cachedData.data, {
      headers: {
        'X-Cache': 'HIT',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      `${BACKEND_URL}/api/stocks/scan?max_results=${maxResults}`,
      {
        signal: controller.signal,
        cache: 'no-store',
      }
    );
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();

    // 캐시 저장
    cachedData = { data, timestamp: Date.now(), key: cacheKey };

    return NextResponse.json(data, {
      headers: {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    // 캐시가 있으면 만료되어도 반환 (stale-while-error)
    if (cachedData && cachedData.key === cacheKey) {
      return NextResponse.json(cachedData.data, {
        headers: {
          'X-Cache': 'STALE',
          'Cache-Control': 'public, s-maxage=60',
        },
      });
    }

    console.error('Stock scan API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stocks', message: String(error) },
      { status: 502 }
    );
  }
}
