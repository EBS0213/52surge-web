import { NextRequest, NextResponse } from 'next/server';
import { getSectorStocks, type SectorStock } from '../../../lib/kis-client';

// 캐시: 업종코드 → { stocks, timestamp }
const cache = new Map<string, { stocks: SectorStock[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5분

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'code parameter required' }, { status: 400 });
  }

  // 캐시 확인
  const cached = cache.get(code);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ code, stocks: cached.stocks, cached: true });
  }

  try {
    const stocks = await getSectorStocks(code);

    // 등락률 기준 내림차순 정렬
    stocks.sort((a, b) => b.changeRate - a.changeRate);

    cache.set(code, { stocks, ts: Date.now() });

    return NextResponse.json({ code, stocks, cached: false });
  } catch (err) {
    console.error('[sector-stocks] Error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch sector stocks' },
      { status: 500 }
    );
  }
}
