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
  commodity: MarketItem[];    // 원자재
  fetchedAt: number;
}

let cache: GlobalData | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5분

const FETCH_OPTS = {
  signal: AbortSignal.timeout(8000),
  headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
};

/** li 태그에서 MarketItem 파싱 (메인 페이지용) */
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

/** 네이버 worldDailyQuote 페이지에서 최신 시세 추출 */
async function fetchCommodityPrice(code: string, label: string): Promise<MarketItem | null> {
  try {
    const url = `https://finance.naver.com/marketindex/worldDailyQuote.naver?marketindexCd=${code}&fdtc=2`;
    const res = await fetch(url, FETCH_OPTS);
    if (!res.ok) return null;
    const html = await res.text();

    // tbl_exchange 테이블의 첫 번째 데이터 행에서 가격 추출
    const rowMatch = html.match(/<tr[^>]*>\s*<td[^>]*class="date"[^>]*>[^<]*<\/td>\s*<td[^>]*class="num"[^>]*>([\d,.]+)<\/td>/);
    if (rowMatch) {
      return { name: label, price: rowMatch[1].trim(), change: '', changeRate: '', isUp: false };
    }

    // 대체: 첫 번째 num 클래스
    const numMatch = html.match(/<td[^>]*class="num"[^>]*>([\d,.]+)/);
    if (numMatch) {
      return { name: label, price: numMatch[1].trim(), change: '', changeRate: '', isUp: false };
    }
  } catch { /* ignore */ }
  return null;
}

/** 네이버 goldDailyQuote 에서 금 시세 (국내 금 g당 원화) */
async function fetchGoldPrice(): Promise<MarketItem | null> {
  try {
    const url = 'https://finance.naver.com/marketindex/goldDailyQuote.naver';
    const res = await fetch(url, FETCH_OPTS);
    if (!res.ok) return null;
    const html = await res.text();

    const rowMatch = html.match(/<td[^>]*class="num"[^>]*>([\d,.]+)/);
    if (rowMatch) {
      return { name: '금', price: rowMatch[1].trim(), change: '', changeRate: '', isUp: false };
    }
  } catch { /* ignore */ }
  return null;
}

// 원자재 코드 매핑 (네이버 worldDailyQuote)
const COMMODITY_CODES: { code: string; label: string }[] = [
  { code: 'OIL_CL', label: 'WTI' },
  { code: 'CMDT_SI', label: '은' },
  { code: 'CMDT_HG', label: '구리' },
  { code: 'CMDT_W', label: '밀' },
];

/** 네이버 시장지표 페이지에서 환율/원자재 파싱 */
async function fetchGlobalData(): Promise<GlobalData> {
  const exchange: MarketItem[] = [];
  const commodity: MarketItem[] = [];

  // ── 1) 메인 페이지에서 환율 파싱 ──
  try {
    const res = await fetch('https://finance.naver.com/marketindex/', FETCH_OPTS);
    if (res.ok) {
      const html = await res.text();

      // 환율 (USD, JPY, EUR, CNY)
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
    }
  } catch (e) {
    console.error('[global] exchange fetch error:', e instanceof Error ? e.message : e);
  }

  // ── 2) 원자재: 금 + 개별 페이지에서 병렬 fetch ──
  try {
    const results = await Promise.allSettled([
      fetchGoldPrice(),
      ...COMMODITY_CODES.map(c => fetchCommodityPrice(c.code, c.label)),
    ]);

    // 금 먼저
    const goldResult = results[0];
    if (goldResult.status === 'fulfilled' && goldResult.value) {
      commodity.push(goldResult.value);
    }

    // WTI, 은, 구리, 밀
    for (let i = 1; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value) {
        commodity.push(r.value);
      }
    }
  } catch (e) {
    console.error('[global] commodity fetch error:', e instanceof Error ? e.message : e);
  }

  // fallback
  if (exchange.length === 0) {
    exchange.push(
      { name: 'USD/KRW', price: '-', change: '', changeRate: '', isUp: false },
      { name: 'JPY/KRW', price: '-', change: '', changeRate: '', isUp: false },
      { name: 'EUR/KRW', price: '-', change: '', changeRate: '', isUp: false },
      { name: 'CNY/KRW', price: '-', change: '', changeRate: '', isUp: false },
    );
  }

  // commodity fallback — 있는 것만 유지, 없는 것만 - 표시
  const commodityNames = ['금', 'WTI', '은', '구리', '밀'];
  for (const name of commodityNames) {
    if (!commodity.find(c => c.name === name)) {
      commodity.push({ name, price: '-', change: '', changeRate: '', isUp: false });
    }
  }

  return { exchange, commodity, fetchedAt: Date.now() };
}

export async function GET() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cache, { headers: { 'X-Cache': 'HIT' } });
  }

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
