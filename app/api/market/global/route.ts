/**
 * 환율 + 원자재 데이터 API
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
  exchange: MarketItem[];     // 환율
  commodity: MarketItem[];    // 원자재 (유가 + 금속)
  fetchedAt: number;
}

let cache: GlobalData | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5분

/** li 태그에서 MarketItem 파싱 */
function parseLi(li: string): MarketItem | null {
  const name = li.match(/class="h_lst[^"]*"[^>]*>\s*<span[^>]*>([^<]+)/)?.[1]?.trim() || '';
  const price = li.match(/class="value"[^>]*>([^<]+)/)?.[1]?.trim() || '';
  const change = li.match(/class="change"[^>]*>([^<]+)/)?.[1]?.trim() || '';
  const isUp = li.includes('ico_up') || li.includes('point_up');
  if (name && price) return { name, price, change, changeRate: '', isUp };
  return null;
}

/** 블록 내 li들 파싱 */
function parseLiBlock(block: string, limit: number): MarketItem[] {
  const items: MarketItem[] = [];
  const liRegex = /<li[\s\S]*?<\/li>/g;
  let m;
  while ((m = liRegex.exec(block)) !== null && items.length < limit) {
    const item = parseLi(m[0]);
    if (item) items.push(item);
  }
  return items;
}

/** 네이버 시장지표 페이지에서 환율/원자재 파싱 */
async function fetchGlobalData(): Promise<GlobalData> {
  const exchange: MarketItem[] = [];
  const commodity: MarketItem[] = [];

  try {
    const res = await fetch('https://finance.naver.com/marketindex/', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OURTLE/1.0)' },
    });
    if (res.ok) {
      const html = await res.text();

      // ── 환율 파싱 (USD, JPY, EUR, CNY) ──
      const exchangeBlock = html.match(/class="market_exchange"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
      if (exchangeBlock) {
        exchange.push(...parseLiBlock(exchangeBlock[0], 4));
      }

      // 환율 대체 파싱
      if (exchange.length === 0) {
        const items = html.match(/<span class="value">[^<]+<\/span>/g) || [];
        const names = ['USD/KRW', 'JPY/KRW', 'EUR/KRW', 'CNY/KRW'];
        items.slice(0, 4).forEach((item, i) => {
          const val = item.match(/>([^<]+)</)?.[1] || '';
          if (val) exchange.push({ name: names[i] || `환율${i}`, price: val, change: '', changeRate: '', isUp: false });
        });
      }

      // ── 유가 파싱 (WTI, 두바이유) ──
      const oilBlock = html.match(/class="market_petro"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
      if (oilBlock) {
        commodity.push(...parseLiBlock(oilBlock[0], 3));
      }

      // ── 금속 파싱 (금, 은, 구리) — 네이버 금융 금시세 페이지 ──
      try {
        const goldRes = await fetch('https://finance.naver.com/marketindex/goldDailyQuote.naver', {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OURTLE/1.0)' },
        });
        if (goldRes.ok) {
          const goldHtml = await goldRes.text();
          // 첫 번째 행에서 금 시세 추출
          const firstRow = goldHtml.match(/<tr[^>]*>[\s\S]*?<td[^>]*class="num"[^>]*>([\d,.]+)[\s\S]*?<\/tr>/);
          if (firstRow) {
            const goldPrice = firstRow[1]?.trim();
            if (goldPrice) {
              commodity.push({ name: '금', price: goldPrice, change: '', changeRate: '', isUp: false });
            }
          }
        }
      } catch { /* 금 시세 실패 무시 */ }

      // 은 시세
      try {
        const silverRes = await fetch('https://finance.naver.com/marketindex/silverDailyQuote.naver', {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OURTLE/1.0)' },
        });
        if (silverRes.ok) {
          const silverHtml = await silverRes.text();
          const firstRow = silverHtml.match(/<tr[^>]*>[\s\S]*?<td[^>]*class="num"[^>]*>([\d,.]+)[\s\S]*?<\/tr>/);
          if (firstRow) {
            const silverPrice = firstRow[1]?.trim();
            if (silverPrice) {
              commodity.push({ name: '은', price: silverPrice, change: '', changeRate: '', isUp: false });
            }
          }
        }
      } catch { /* 은 시세 실패 무시 */ }

      // 구리 — 국제 구리 선물 (Investing.com 대신 네이버 원자재에서)
      try {
        const copperRes = await fetch('https://finance.naver.com/marketindex/copperDailyQuote.naver', {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OURTLE/1.0)' },
        });
        if (copperRes.ok) {
          const copperHtml = await copperRes.text();
          const firstRow = copperHtml.match(/<tr[^>]*>[\s\S]*?<td[^>]*class="num"[^>]*>([\d,.]+)[\s\S]*?<\/tr>/);
          if (firstRow) {
            const copperPrice = firstRow[1]?.trim();
            if (copperPrice) {
              commodity.push({ name: '구리', price: copperPrice, change: '', changeRate: '', isUp: false });
            }
          }
        }
      } catch { /* 구리 시세 실패 무시 */ }
    }
  } catch (e) {
    console.error('[global] fetch error:', e instanceof Error ? e.message : e);
  }

  // 스크래핑 실패 시 fallback
  if (exchange.length === 0) {
    exchange.push(
      { name: 'USD/KRW', price: '-', change: '', changeRate: '', isUp: false },
      { name: 'JPY/KRW', price: '-', change: '', changeRate: '', isUp: false },
      { name: 'EUR/KRW', price: '-', change: '', changeRate: '', isUp: false },
      { name: 'CNY/KRW', price: '-', change: '', changeRate: '', isUp: false },
    );
  }
  if (commodity.length === 0) {
    commodity.push(
      { name: 'WTI', price: '-', change: '', changeRate: '', isUp: false },
      { name: '두바이유', price: '-', change: '', changeRate: '', isUp: false },
      { name: '금', price: '-', change: '', changeRate: '', isUp: false },
      { name: '은', price: '-', change: '', changeRate: '', isUp: false },
      { name: '구리', price: '-', change: '', changeRate: '', isUp: false },
    );
  }

  return { exchange, commodity, fetchedAt: Date.now() };
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
    return NextResponse.json({ exchange: [], commodity: [], fetchedAt: 0 }, { status: 500 });
  }
}
