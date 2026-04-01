/**
 * 시장 순위 API — 거래량/등락률/신고가 근접
 * GET /api/kis/rankings?type=volume|gainers|losers|newhigh
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  getVolumeRank,
  getFluctuationRank,
  getNearHighLow,
  isKISConfigured,
} from '../../../lib/kis-client';

// 캐시: 타입별 5분
const cacheMap = new Map<string, { data: unknown; fetchedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'volume';
  const cacheKey = `rankings_${type}`;

  // 캐시 확인
  const cached = cacheMap.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached.data, { headers: { 'X-Cache': 'HIT' } });
  }

  // 만료 캐시 즉시 반환 + 백그라운드 갱신
  if (cached) {
    fetchRankingData(type)
      .then((data) => cacheMap.set(cacheKey, { data, fetchedAt: Date.now() }))
      .catch(() => {});
    return NextResponse.json(cached.data, { headers: { 'X-Cache': 'STALE' } });
  }

  if (!isKISConfigured()) {
    return NextResponse.json({ error: 'KIS API not configured' }, { status: 503 });
  }

  try {
    const data = await fetchRankingData(type);
    cacheMap.set(cacheKey, { data, fetchedAt: Date.now() });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: `순위 조회 실패: ${error instanceof Error ? error.message : ''}` },
      { status: 500 }
    );
  }
}

async function fetchRankingData(type: string) {
  switch (type) {
    case 'volume':
      return { type: 'volume', label: '거래량 TOP', items: await getVolumeRank() };
    case 'gainers':
      return { type: 'gainers', label: '상승률 TOP', items: await getFluctuationRank('up') };
    case 'losers':
      return { type: 'losers', label: '하락률 TOP', items: await getFluctuationRank('down') };
    case 'newhigh':
      return { type: 'newhigh', label: '신고가 근접', items: await getNearHighLow('high') };
    default:
      return { type: 'volume', label: '거래량 TOP', items: await getVolumeRank() };
  }
}
