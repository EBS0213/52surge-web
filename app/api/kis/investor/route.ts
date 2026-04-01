/**
 * 종목별 투자자 매매동향 API
 * GET /api/kis/investor?code=005930
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getStockInvestor, isKISConfigured } from '../../../lib/kis-client';

// 캐시: 종목별 5분
const cacheMap = new Map<string, { data: unknown; fetchedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'code required' }, { status: 400 });
  }

  const cacheKey = `investor_${code}`;
  const cached = cacheMap.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached.data, { headers: { 'X-Cache': 'HIT' } });
  }

  if (!isKISConfigured()) {
    return NextResponse.json({ error: 'KIS API not configured' }, { status: 503 });
  }

  try {
    const data = await getStockInvestor(code);
    cacheMap.set(cacheKey, { data, fetchedAt: Date.now() });
    return NextResponse.json(data);
  } catch (error) {
    if (cached) return NextResponse.json(cached.data, { headers: { 'X-Cache': 'STALE' } });
    return NextResponse.json(
      { error: `투자자 데이터 조회 실패: ${error instanceof Error ? error.message : ''}` },
      { status: 500 }
    );
  }
}
