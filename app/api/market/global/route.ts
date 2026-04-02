/**
 * 환율 + 유가 데이터 API
 * GET /api/market/global
 *
 * 네이버 금융 마켓지표에서 스크래핑
 */

import { NextResponse } from 'next/server';

interface MarketItem {
  name: string;
  price: string;
  change: string;
  changeRate: string;
  isUp: boolean;
}

interface GlobalData {
  exchange: MarketItem[];  // 환율
  oil: MarketItem[];       // 유가
  fetchedAt: number;
}

let cache: GlobalData | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5분

/** 네이버 시장지표 페이지에서 환율/유가 파싱 */
async function fetchGlobalData(): Promise<GlobalData> {
  const exchange: MarketItem[] = [];
  const oil: MarketItem[] = [];

  // 환전 고시 환율 (하나은행 기준)
  try {
    const res = await fetch('https://finance.naver.com/marketindex/', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OURTLE/1.0)' },
    });
    if (res.ok) {
      const html = await res.text();

      // 환율 파싱 - exchangeList area
      const exchangeBlock = html.match(/class="market_exchange"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
      if (exchangeBlock) {
        // 각 li 항목 파싱
        const liRegex = /<li[\s\S]*?<\/li>/g;
        let m;
        while ((m = liRegex.exec(exchangeBlock[0])) !== null && exchange.length < 4) {
          const li = m[0];
          const name = li.match(/class="h_lst[^"]*"[^>]*>\s*<span[^>]*>([^<]+)/)?.[1]?.trim() || '';
          const price = li.match(/class="value"[^>]*>([^<]+)/)?.[1]?.trim() || '';
          const change = li.match(/class="change"[^>]*>([^<]+)/)?.[1]?.trim() || '';
          const isUp = li.includes('ico_up') || li.includes('point_up');
          if (name && price) {
            exchange.push({ name, price, change, changeRate: '', isUp });
          }
        }
      }

      // 환율이 안 잡히면 대체 파싱
      if (exchange.length === 0) {
        // data-head 방식
        const items = html.match(/<span class="value">[^<]+<\/span>/g) || [];
        const names = ['USD/KRW', 'JPY/KRW', 'EUR/KRW', 'CNY/KRW'];
        items.slice(0, 4).forEach((item, i) => {
          const val = item.match(/>([^<]+)</)?.[1] || '';
          if (val) exchange.push({ name: names[i] || `환율${i}`, price: val, change: '', changeRate: '', isUp: false });
        });
      }

      // 유가 파싱 - marketindex oil area
      const oilBlock = html.match(/class="market_petro"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
      if (oilBlock) {
        const liRegex2 = /<li[\s\S]*?<\/li>/g;
        let m2;
        while ((m2 = liRegex2.exec(oilBlock[0])) !== null && oil.length < 4) {
          const li = m2[0];
          const name = li.match(/class="h_lst[^"]*"[^>]*>\s*<span[^>]*>([^<]+)/)?.[1]?.trim() || '';
          const price = li.match(/class="value"[^>]*>([^<]+)/)?.[1]?.trim() || '';
          const change = li.match(/class="change"[^>]*>([^<]+)/)?.[1]?.trim() || '';
          const isUp = li.includes('ico_up') || li.includes('point_up');
          if (name && price) {
            oil.push({ name, price, change, changeRate: '', isUp });
          }
        }
      }
    }
  } catch (e) {
    console.error('[global] fetch error:', e instanceof Error ? e.message : e);
  }

  // 스크래핑 실패 시 대체: 하드코딩 라벨 + 빈 값
  if (exchange.length === 0) {
    exchange.push(
      { name: 'USD/KRW', price: '-', change: '', changeRate: '', isUp: false },
      { name: 'JPY/KRW', price: '-', change: '', changeRate: '', isUp: false },
    );
  }
  if (oil.length === 0) {
    oil.push(
      { name: 'WTI', price: '-', change: '', changeRate: '', isUp: false },
      { name: '두바이유', price: '-', change: '', changeRate: '', isUp: false },
    );
  }

  return { exchange, oil, fetchedAt: Date.now() };
}

export async function GET() {
  // 캐시 확인
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cache, { headers: { 'X-Cache': 'HIT' } });
  }

  // 만료 캐시 즉시 반환 + 백그라운드 갱신
  if (cache) {
    fetchGlobalData().then(data => { cache = data; }).catch(() => {});
    return NextResponse.json(cache, { headers: { 'X-Cache': 'STALE' } });
  }

  try {
    const data = await fetchGlobalData();
    cache = data;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ exchange: [], oil: [], fetchedAt: 0 }, { status: 500 });
  }
}
