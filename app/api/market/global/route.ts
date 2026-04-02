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
  exchange: MarketItem[];
  commodity: MarketItem[];
  fetchedAt: number;
}

let cache: GlobalData | null = null;
const CACHE_TTL = 5 * 60 * 1000;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

/** 메인 페이지에서 특정 head 클래스 블록의 value/change 추출 */
function parseHeadBlock(html: string, headClass: string, label: string): MarketItem | null {
  // class="head usd" ... </a> 블록 추출
  const regex = new RegExp(`class="${headClass}"[\\s\\S]*?<\\/a>`);
  const block = html.match(regex);
  if (!block) return null;

  const value = block[0].match(/class="value"[^>]*>([\d,.]+)/);
  const change = block[0].match(/class="change"[^>]*>([\d,.]+)/);
  const isUp = block[0].includes('point_up');

  if (value) {
    return {
      name: label,
      price: value[1].trim(),
      change: change ? change[1].trim() : '',
      changeRate: '',
      isUp,
    };
  }
  return null;
}

/** 네이버 worldDailyQuote 페이지에서 최신 시세 추출 */
async function fetchWorldQuote(code: string, label: string): Promise<MarketItem | null> {
  try {
    const url = `https://finance.naver.com/marketindex/worldDailyQuote.naver?marketindexCd=${code}&fdtc=2`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // 테이블 첫 행의 num 클래스에서 가격 (값이 다음 줄에 있을 수 있음)
    const numMatch = html.match(/<td[^>]*class="num"[^>]*>\s*([\d,.]+)/);
    if (numMatch) {
      return { name: label, price: numMatch[1].trim(), change: '', changeRate: '', isUp: false };
    }
  } catch { /* ignore */ }
  return null;
}

/** 네이버 goldDailyQuote에서 금 시세 */
async function fetchGoldPrice(): Promise<MarketItem | null> {
  try {
    const res = await fetch('https://finance.naver.com/marketindex/goldDailyQuote.naver', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const numMatch = html.match(/<td[^>]*class="num"[^>]*>\s*([\d,.]+)/);
    if (numMatch) {
      return { name: '금', price: numMatch[1].trim(), change: '', changeRate: '', isUp: false };
    }
  } catch { /* ignore */ }
  return null;
}

// 메인 페이지에서 파싱할 환율 목록
const EXCHANGE_HEADS = [
  { cls: 'head usd', name: 'USD/KRW' },
  { cls: 'head jpy', name: 'JPY/KRW' },
  { cls: 'head eur', name: 'EUR/KRW' },
  { cls: 'head cny', name: 'CNY/KRW' },
];

// 메인 페이지에서 파싱할 원자재
const COMMODITY_HEADS = [
  { cls: 'head wti', name: 'WTI' },
];

// 개별 페이지에서 가져올 원자재
const WORLD_QUOTES = [
  { code: 'CMDT_SI', name: '은' },
  { code: 'CMDT_HG', name: '구리' },
  { code: 'CMDT_W', name: '밀' },
];

async function fetchGlobalData(): Promise<GlobalData> {
  const exchange: MarketItem[] = [];
  const commodity: MarketItem[] = [];

  // ── 1) 메인 페이지 ──
  try {
    const res = await fetch('https://finance.naver.com/marketindex/', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': UA },
    });
    if (res.ok) {
      const html = await res.text();

      // 환율
      for (const h of EXCHANGE_HEADS) {
        const item = parseHeadBlock(html, h.cls, h.name);
        if (item) exchange.push(item);
      }

      // WTI (메인 페이지)
      for (const h of COMMODITY_HEADS) {
        const item = parseHeadBlock(html, h.cls, h.name);
        if (item) commodity.push(item);
      }
    }
  } catch (e) {
    console.error('[global] main page error:', e instanceof Error ? e.message : e);
  }

  // ── 2) 금 + 개별 원자재 페이지 병렬 fetch ──
  try {
    const results = await Promise.allSettled([
      fetchGoldPrice(),
      ...WORLD_QUOTES.map(q => fetchWorldQuote(q.code, q.name)),
    ]);

    // 금
    if (results[0].status === 'fulfilled' && results[0].value) {
      commodity.unshift(results[0].value); // 금을 맨 앞에
    }

    // 은, 구리, 밀
    for (let i = 1; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value) {
        commodity.push(r.value);
      }
    }
  } catch (e) {
    console.error('[global] commodity error:', e instanceof Error ? e.message : e);
  }

  // fallback
  if (exchange.length === 0) {
    for (const h of EXCHANGE_HEADS) {
      exchange.push({ name: h.name, price: '-', change: '', changeRate: '', isUp: false });
    }
  }

  const expectedCommodities = ['금', 'WTI', '은', '구리', '밀'];
  for (const name of expectedCommodities) {
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
