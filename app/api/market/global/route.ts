/**
 * 환율 + 원자재 데이터 API
 * GET /api/market/global
 *
 * 네이버 금융 마켓지표 메인 페이지에서 스크래핑
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

// 메인 페이지에서 파싱할 환율 목록
const EXCHANGE_HEADS = [
  { cls: 'head usd', name: 'USD/KRW' },
  { cls: 'head jpy', name: 'JPY/KRW' },
  { cls: 'head eur', name: 'EUR/KRW' },
  { cls: 'head cny', name: 'CNY/KRW' },
];

// 메인 페이지에서 파싱할 원자재 (모두 메인 페이지에서 제공)
const COMMODITY_HEADS = [
  { cls: 'head gold_inter', name: '국제금' },
  { cls: 'head gold_domestic', name: '국내금' },
  { cls: 'head wti', name: 'WTI' },
  { cls: 'head gasoline', name: '휘발유' },
];

async function fetchGlobalData(): Promise<GlobalData> {
  const exchange: MarketItem[] = [];
  const commodity: MarketItem[] = [];

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

      // 원자재
      for (const h of COMMODITY_HEADS) {
        const item = parseHeadBlock(html, h.cls, h.name);
        if (item) commodity.push(item);
      }
    }
  } catch (e) {
    console.error('[global] main page error:', e instanceof Error ? e.message : e);
  }

  // fallback
  if (exchange.length === 0) {
    for (const h of EXCHANGE_HEADS) {
      exchange.push({ name: h.name, price: '-', change: '', changeRate: '', isUp: false });
    }
  }

  if (commodity.length === 0) {
    for (const h of COMMODITY_HEADS) {
      commodity.push({ name: h.name, price: '-', change: '', changeRate: '', isUp: false });
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
