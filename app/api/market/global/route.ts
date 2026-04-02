/**
 * 환율 + 원자재 데이터 API
 * GET /api/market/global
 *
 * 네이버 금융 마켓지표 메인 페이지 + 개별 상세 페이지에서 스크래핑
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

/** 메인 페이지에서 특정 head 클래스 블록의 value/change 추출 */
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

/** 네이버 개별 상세 페이지에서 가격/등락 추출 */
async function fetchDetailPage(code: string, label: string, unit: string): Promise<MarketItem | null> {
  try {
    const url = `https://finance.naver.com/marketindex/commodityDetail.naver?marketindexCd=${code}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // 상세 페이지: class="no_today" 안에 현재가
    const priceMatch = html.match(/class="no_today"[\s\S]*?<em[\s\S]*?>([\d,.]+)<\/em>/);
    // 등락: class="no_exday" 안에 변동값
    const changeMatch = html.match(/class="no_exday"[\s\S]*?<em[\s\S]*?>([\d,.]+)<\/em>/);
    const isUp = html.includes('ico_up') || html.includes('point_up');
    const isDown = html.includes('ico_down') || html.includes('point_dn');

    if (priceMatch) {
      return {
        name: label,
        price: priceMatch[1].trim(),
        change: changeMatch ? changeMatch[1].trim() : '',
        changeRate: '',
        isUp: isUp && !isDown,
        unit,
      };
    }
  } catch (e) {
    console.error(`[global] detail page error (${code}):`, e instanceof Error ? e.message : e);
  }
  return null;
}

// 메인 페이지에서 파싱할 환율 목록
const EXCHANGE_HEADS = [
  { cls: 'head usd', name: 'USD/KRW', unit: '원' },
  { cls: 'head jpy', name: 'JPY/KRW', unit: '원/100엔' },
  { cls: 'head eur', name: 'EUR/KRW', unit: '원' },
  { cls: 'head cny', name: 'CNY/KRW', unit: '원' },
];

// 원자재: 메인 페이지 head 블록 시도 → 없으면 개별 상세 페이지 fallback
const COMMODITY_CONFIG = [
  { cls: 'head gold_inter', name: 'Gold', unit: '$/oz', detailCode: 'CMDT_GC' },
  { cls: 'head silver', name: '은', unit: '$/oz', detailCode: 'CMDT_SIL' },
  { cls: 'head wti', name: 'WTI', unit: '$/bbl', detailCode: 'OIL_CL' },
  { cls: 'head copper', name: '구리', unit: '$/lb', detailCode: 'CMDT_CDY' },
];

async function fetchGlobalData(): Promise<GlobalData> {
  const exchange: MarketItem[] = [];
  const commodity: MarketItem[] = [];
  let mainHtml = '';

  try {
    const res = await fetch('https://finance.naver.com/marketindex/', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': UA },
    });
    if (res.ok) {
      mainHtml = await res.text();

      // 환율
      for (const h of EXCHANGE_HEADS) {
        const item = parseHeadBlock(mainHtml, h.cls, h.name, h.unit);
        if (item) exchange.push(item);
      }
    }
  } catch (e) {
    console.error('[global] main page error:', e instanceof Error ? e.message : e);
  }

  // 원자재: 메인 페이지 시도 → 실패 시 상세 페이지
  const detailFetches: Promise<void>[] = [];
  for (const c of COMMODITY_CONFIG) {
    const fromMain = mainHtml ? parseHeadBlock(mainHtml, c.cls, c.name, c.unit) : null;
    if (fromMain) {
      commodity.push(fromMain);
    } else {
      // 상세 페이지에서 가져오기 (병렬)
      detailFetches.push(
        fetchDetailPage(c.detailCode, c.name, c.unit).then(item => {
          if (item) commodity.push(item);
        })
      );
    }
  }
  if (detailFetches.length > 0) {
    await Promise.allSettled(detailFetches);
  }

  // 원자재 순서 보정 (병렬 fetch로 순서가 바뀔 수 있음)
  const orderMap = new Map(COMMODITY_CONFIG.map((c, i) => [c.name, i]));
  commodity.sort((a, b) => (orderMap.get(a.name) ?? 99) - (orderMap.get(b.name) ?? 99));

  // fallback
  if (exchange.length === 0) {
    for (const h of EXCHANGE_HEADS) {
      exchange.push({ name: h.name, price: '-', change: '', changeRate: '', isUp: false, unit: h.unit });
    }
  }

  if (commodity.length === 0) {
    for (const c of COMMODITY_CONFIG) {
      commodity.push({ name: c.name, price: '-', change: '', changeRate: '', isUp: false, unit: c.unit });
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
