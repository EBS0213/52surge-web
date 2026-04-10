/**
 * 테마별 구성종목 시세 API
 * GET /api/kis/theme-stocks?code=004
 *
 * themes.json 기반으로 테마 구성종목의 현재가를 조회.
 * 개별 종목 캐시(sp-XXXXXX)를 공유하므로 theme-rs 백그라운드가 돌고 있으면 즉시 응답.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentPrice, isKISConfigured } from '../../../lib/kis-client';
import { cacheGet, cacheSet, cacheGetStale } from '../../../lib/file-cache';
import themesData from '../../../data/themes.json';

const themes = themesData as Record<string, { name: string; stocks: string[] }>;

const STOCK_TTL = 10 * 60 * 1000; // 개별 종목 캐시 10분
const THEME_TTL = 5 * 60 * 1000;  // 테마 전체 결과 캐시 5분

function themeCacheKey(code: string) { return `theme-stocks-${code}`; }
function stockCacheKey(code: string) { return `sp-${code}`; }

interface StockPrice {
  code: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  marketCap: number;
}

/** 개별 종목 현재가 조회 (캐시 우선) */
async function fetchStockPrice(code: string): Promise<StockPrice | null> {
  // 1. 개별 종목 캐시 확인
  const cached = cacheGet<StockPrice>(stockCacheKey(code), STOCK_TTL);
  if (cached) return cached.data;

  try {
    const data = await getCurrentPrice(code);
    const sign = String(data.prdy_vrss_sign || '');
    const isDown = sign === '4' || sign === '5';

    const info: StockPrice = {
      code,
      name: data.hts_kor_isnm || code,
      price: Number(data.stck_prpr || 0),
      change: isDown
        ? -Math.abs(Number(data.prdy_vrss || 0))
        : Math.abs(Number(data.prdy_vrss || 0)),
      changeRate: isDown
        ? -Math.abs(Number(data.prdy_ctrt || 0))
        : Math.abs(Number(data.prdy_ctrt || 0)),
      volume: Number(data.acml_vol || 0),
      marketCap: Math.round(Number(data.stck_avls || 0) / 100_000_000),
    };

    cacheSet(stockCacheKey(code), info);
    return info;
  } catch (err) {
    console.error(`[theme-stocks] ${code} error:`, err);
    // stale 캐시라도 반환
    return cacheGetStale<StockPrice>(stockCacheKey(code));
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code || !themes[code]) {
    return NextResponse.json({ error: 'Invalid theme code' }, { status: 400 });
  }

  // 테마 전체 결과 캐시 확인
  const cached = cacheGet<{ stocks: StockPrice[] }>(themeCacheKey(code), THEME_TTL);
  if (cached) {
    return NextResponse.json({
      code,
      name: themes[code].name,
      ...cached.data,
      cached: true,
    }, { headers: { 'X-Cache': 'HIT' } });
  }

  const theme = themes[code];
  const stocks: StockPrice[] = [];

  // 먼저 캐시에서 가져올 수 있는 것 수집
  const uncached: string[] = [];
  for (const sc of theme.stocks) {
    const c = cacheGet<StockPrice>(stockCacheKey(sc), STOCK_TTL);
    if (c) {
      stocks.push(c.data);
    } else {
      uncached.push(sc);
    }
  }

  // 캐시에 없는 종목만 API 호출 (최대 30개로 제한, 나머지는 백그라운드)
  const toFetch = uncached.slice(0, 30);
  for (let i = 0; i < toFetch.length; i++) {
    const result = await fetchStockPrice(toFetch[i]);
    if (result) stocks.push(result);
    if (i < toFetch.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // 등락률 순 정렬
  stocks.sort((a, b) => b.changeRate - a.changeRate);

  const result = { stocks };
  cacheSet(themeCacheKey(code), result);

  return NextResponse.json({
    code,
    name: theme.name,
    stocks,
    cached: false,
  });
}
