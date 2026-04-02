/**
 * 환율 + 원자재 데이터 API
 * GET /api/market/global
 *
 * 환율: 네이버 금융 마켓지표 페이지 스크래핑
 * 원자재: Yahoo Finance API (Gold, Silver, WTI, Copper)
 */

import { NextResponse } from 'next/server';

interface MarketItem {
  name: string;
  price: string;
  change: string;
  changeRate: string;
  isUp: boolean;
  unit: string;
}

interface GlobalData {
  exchange: MarketItem[];
  commodity: MarketItem[];
  fetchedAt: number;
}

let cache: GlobalData | null = null;
const CACHE_TTL = 5 * 60 * 1000;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

// ───────────────────────────────────────────────
// 환율: 네이버 금융 메인 페이지 스크래핑
// ───────────────────────────────────────────────

const EXCHANGE_HEADS = [
  { cls: 'head usd', name: 'USD/KRW', unit: '원' },
  { cls: 'head jpy', name: 'JPY/KRW', unit: '원/100엔' },
  { cls: 'head eur', name: 'EUR/KRW', unit: '원' },
  { cls: 'head cny', name: 'CNY/KRW', unit: '원' },
];

function parseHeadBlock(html: string, headClass: string, label: string, unit: string): MarketItem | null {
  const regex = new RegExp(`class="${headClass}"[\\s\\S]*?<\\/a>`);
  const block = html.match(regex);
  if (!block) return null;

  const value = block[0].match(/class="value"[^>]*>([\d,.]+)/);
  const change = block[0].match(/class="change"[^>]*>(?:<[^>]*>)*\s*([\d,.]+)/);
  const changeRate = block[0].match(/class="change_rate"[^>]*>(?:<[^>]*>)*([\d,.]+%?)/);
  const isUp = block[0].includes('point_up');

  if (value) {
    return {
      name: label,
      price: value[1].trim(),
      change: change ? change[1].trim() : '',
      changeRate: changeRate ? changeRate[1].trim() : '',
      isUp,
      unit,
    };
  }
  return null;
}

async function fetchExchange(): Promise<MarketItem[]> {
  const exchange: MarketItem[] = [];
  try {
    const res = await fetch('https://finance.naver.com/marketindex/', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': UA },
    });
    if (res.ok) {
      const html = await res.text();
      for (const h of EXCHANGE_HEADS) {
        const item = parseHeadBlock(html, h.cls, h.name, h.unit);
        if (item) exchange.push(item);
      }
    }
  } catch (e) {
    console.error('[global] exchange fetch error:', e instanceof Error ? e.message : e);
  }

  if (exchange.length === 0) {
    for (const h of EXCHANGE_HEADS) {
      exchange.push({ name: h.name, price: '-', change: '', changeRate: '', isUp: false, unit: h.unit });
    }
  }
  return exchange;
}

// ───────────────────────────────────────────────
// 원자재: Yahoo Finance API
// ───────────────────────────────────────────────

const COMMODITY_SYMBOLS = [
  { symbol: 'GC=F', name: 'Gold', unit: '$/oz' },
  { symbol: 'SI=F', name: 'Silver', unit: '$/oz' },
  { symbol: 'CL=F', name: 'WTI', unit: '$/bbl' },
  { symbol: 'HG=F', name: 'Copper', unit: '$/lb' },
];

async function fetchYahooCommodity(symbol: string, name: string, unit: string): Promise<MarketItem | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1d`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`[global] Yahoo ${symbol} HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice;
    const previousClose = meta.chartPreviousClose ?? meta.previousClose;

    if (currentPrice == null) return null;

    const changeVal = previousClose ? currentPrice - previousClose : 0;
    const changeRateVal = previousClose ? (changeVal / previousClose) * 100 : 0;
    const isUp = changeVal >= 0;

    return {
      name,
      price: currentPrice.toFixed(2),
      change: Math.abs(changeVal).toFixed(2),
      changeRate: `${Math.abs(changeRateVal).toFixed(2)}%`,
      isUp,
      unit,
    };
  } catch (e) {
    console.error(`[global] Yahoo ${symbol} error:`, e instanceof Error ? e.message : e);
    return null;
  }
}

async function fetchCommodities(): Promise<MarketItem[]> {
  const results = await Promise.allSettled(
    COMMODITY_SYMBOLS.map(c => fetchYahooCommodity(c.symbol, c.name, c.unit))
  );

  const items: MarketItem[] = [];
  for (let i = 0; i < COMMODITY_SYMBOLS.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      items.push(r.value);
    } else {
      items.push({
        name: COMMODITY_SYMBOLS[i].name,
        price: '-',
        change: '',
        changeRate: '',
        isUp: false,
        unit: COMMODITY_SYMBOLS[i].unit,
      });
    }
  }
  return items;
}

// ───────────────────────────────────────────────
// GET handler
// ───────────────────────────────────────────────

async function fetchGlobalData(): Promise<GlobalData> {
  const [exchange, commodity] = await Promise.all([
    fetchExchange(),
    fetchCommodities(),
  ]);
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
