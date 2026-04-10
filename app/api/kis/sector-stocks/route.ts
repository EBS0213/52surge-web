import { NextRequest, NextResponse } from 'next/server';
import { getSectorStocks, SECTOR_CODES } from '../../../lib/kis-client';
import { cacheGet, cacheSet, cacheGetStale } from '../../../lib/file-cache';

const CACHE_TTL = 10 * 60 * 1000; // 10분 (장외 자동 3배)

function cacheKey(code: string) { return `sector-stocks-${code}`; }

// ── 백그라운드 프리캐시: 서버 시작 시 모든 업종 종목 미리 로드 ──
let preloaded = false;
async function preloadAllSectors() {
  if (preloaded) return;
  preloaded = true;

  const sectors = SECTOR_CODES.filter((s) => s.code !== '0001');
  console.log(`[sector-stocks] 프리캐시 시작: ${sectors.length}개 업종`);

  for (const sector of sectors) {
    // 이미 파일 캐시 있으면 스킵
    if (cacheGet(cacheKey(sector.code), CACHE_TTL)) continue;

    try {
      const stocks = await getSectorStocks(sector.code);
      stocks.sort((a, b) => b.changeRate - a.changeRate);
      cacheSet(cacheKey(sector.code), stocks);
      console.log(`[sector-stocks] cached ${sector.name}: ${stocks.length}개`);
    } catch (err) {
      console.error(`[sector-stocks] preload ${sector.name} error:`, err);
    }
    // 레이트리밋 방지
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('[sector-stocks] 프리캐시 완료');
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'code parameter required' }, { status: 400 });
  }

  // 백그라운드 프리캐시 시작 (fire-and-forget)
  setTimeout(() => preloadAllSectors(), 100);

  // 파일 캐시 확인
  const cached = cacheGet<typeof stocks>(cacheKey(code), CACHE_TTL);
  if (cached) {
    return NextResponse.json({
      code,
      stocks: cached.data,
      cached: true,
    }, {
      headers: { 'X-Cache': 'HIT' },
    });
  }

  try {
    const stocks = await getSectorStocks(code);
    stocks.sort((a, b) => b.changeRate - a.changeRate);
    cacheSet(cacheKey(code), stocks);

    return NextResponse.json({ code, stocks, cached: false });
  } catch (err) {
    console.error('[sector-stocks] Error:', err);

    // stale 캐시라도 반환
    const stale = cacheGetStale(cacheKey(code));
    if (stale) {
      return NextResponse.json({ code, stocks: stale, cached: true }, {
        headers: { 'X-Cache': 'STALE' },
      });
    }

    return NextResponse.json(
      { error: 'Failed to fetch sector stocks' },
      { status: 500 }
    );
  }
}
