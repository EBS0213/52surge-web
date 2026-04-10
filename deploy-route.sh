#!/bin/bash
# Deploy updated route.ts to EC2
# Usage: bash ~/Desktop/터미널/52surge\ program/deploy-route.sh

KEY="./52surge-key.pem"
HOST="ubuntu@3.37.194.236"
REMOTE_FILE="unimind-web/app/api/market/global/route.ts"

ssh -i "$KEY" "$HOST" "cat > $REMOTE_FILE" << 'ROUTEFILE'
/**
 * 환율 + 원자재 데이터 API
 * GET /api/market/global
 *
 * 환율: 네이버 금융 마켓지표 메인 페이지 스크래핑 (euc-kr)
 * 원자재: Gold, WTI → 네이버 / Silver, Copper → Yahoo Finance
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
// 네이버 마켓지표 메인 페이지 → 환율 + Gold/WTI
// ───────────────────────────────────────────────

const EXCHANGE_HEADS = [
  { cls: 'head usd', name: 'USD/KRW', unit: '원' },
  { cls: 'head jpy', name: 'JPY/KRW', unit: '원/100엔' },
  { cls: 'head eur', name: 'EUR/KRW', unit: '원' },
  { cls: 'head cny', name: 'CNY/KRW', unit: '원' },
];

const NAVER_COMMODITY_HEADS = [
  { cls: 'head gold_inter', name: 'Gold', unit: '$/oz' },
  { cls: 'head wti', name: 'WTI', unit: '$/bbl' },
];

function parseHeadBlock(html: string, headClass: string, label: string, unit: string): MarketItem | null {
  const regex = new RegExp('class="' + headClass + '"[\\s\\S]*?<\\/a>');
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

async function fetchNaverPage(): Promise<string> {
  try {
    const res = await fetch('https://finance.naver.com/marketindex/', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) return '';
    const buf = await res.arrayBuffer();
    const decoder = new TextDecoder('euc-kr');
    return decoder.decode(buf);
  } catch (e) {
    console.error('[global] naver fetch error:', e instanceof Error ? e.message : e);
    return '';
  }
}

// ───────────────────────────────────────────────
// Yahoo Finance → Silver, Copper
// ───────────────────────────────────────────────

const YAHOO_COMMODITIES = [
  { symbol: 'SI=F', name: 'Silver', unit: '$/oz' },
  { symbol: 'HG=F', name: 'Copper', unit: '$/lb' },
];

async function fetchYahoo(symbol: string, name: string, unit: string): Promise<MarketItem | null> {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '?range=1d&interval=1d';
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    });
    if (!res.ok) {
      console.error('[global] Yahoo ' + symbol + ' HTTP ' + res.status);
      return null;
    }
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? meta.previousClose;
    if (price == null) return null;

    const diff = prev ? price - prev : 0;
    const rate = prev ? (diff / prev) * 100 : 0;

    return {
      name,
      price: price.toFixed(2),
      change: Math.abs(diff).toFixed(2),
      changeRate: Math.abs(rate).toFixed(2) + '%',
      isUp: diff >= 0,
      unit,
    };
  } catch (e) {
    console.error('[global] Yahoo ' + symbol + ' error:', e instanceof Error ? e.message : e);
    return null;
  }
}

// ───────────────────────────────────────────────
// 합성: fetchGlobalData
// ───────────────────────────────────────────────

function placeholder(name: string, unit: string): MarketItem {
  return { name, price: '-', change: '', changeRate: '', isUp: false, unit };
}

async function fetchGlobalData(): Promise<GlobalData> {
  // 네이버 + Yahoo 병렬 호출
  const [naverHtml, ...yahooResults] = await Promise.all([
    fetchNaverPage(),
    ...YAHOO_COMMODITIES.map(c => fetchYahoo(c.symbol, c.name, c.unit)),
  ]);

  // 환율
  const exchange: MarketItem[] = [];
  for (const h of EXCHANGE_HEADS) {
    const item = naverHtml ? parseHeadBlock(naverHtml, h.cls, h.name, h.unit) : null;
    exchange.push(item || placeholder(h.name, h.unit));
  }

  // 원자재: Gold → Silver → WTI → Copper 순서
  const commodity: MarketItem[] = [];

  // Gold (네이버)
  const gold = naverHtml ? parseHeadBlock(naverHtml, 'head gold_inter', 'Gold', '$/oz') : null;
  commodity.push(gold || placeholder('Gold', '$/oz'));

  // Silver (Yahoo)
  commodity.push(yahooResults[0] || placeholder('Silver', '$/oz'));

  // WTI (네이버)
  const wti = naverHtml ? parseHeadBlock(naverHtml, 'head wti', 'WTI', '$/bbl') : null;
  commodity.push(wti || placeholder('WTI', '$/bbl'));

  // Copper (Yahoo)
  commodity.push(yahooResults[1] || placeholder('Copper', '$/lb'));

  return { exchange, commodity, fetchedAt: Date.now() };
}

// ───────────────────────────────────────────────
// GET handler
// ───────────────────────────────────────────────

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
ROUTEFILE

echo "--- File uploaded. Building... ---"
ssh -i "$KEY" "$HOST" "cd unimind-web && npm run build && pm2 restart unimind-web && sleep 3 && curl -s http://localhost:3000/api/market/global"
