/**
 * KOSPI / KOSDAQ 지수 현재가 + 일봉 OHLC 차트 API
 * KIS OpenAPI: 국내 주식 업종 기간별 시세 (FHKUP03500100)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken, isKISConfigured } from '../../lib/kis-client';

const BASE_URL = process.env.KIS_BASE_URL || 'https://openapi.koreainvestment.com:9443';
const APP_KEY = process.env.KIS_APP_KEY || '';
const APP_SECRET = process.env.KIS_APP_SECRET || '';

// 캐시 (5분) - 기간별 캐시
const cacheMap = new Map<string, { data: unknown; fetchedAt: number }>();
const CACHE_TTL = 1 * 60 * 1000; // 1분

// 기간 설정
type PeriodKey = '1w' | '1m' | '3m' | '1y' | '3y';
const PERIOD_CONFIG: Record<PeriodKey, { days: number; periodCode: string }> = {
  '1w': { days: 14, periodCode: 'D' },    // 1주 (여유있게 14일 일봉)
  '1m': { days: 35, periodCode: 'D' },    // 1개월 일봉
  '3m': { days: 90, periodCode: 'D' },    // 3개월 일봉
  '1y': { days: 365, periodCode: 'W' },   // 1년 주봉
  '3y': { days: 1095, periodCode: 'M' },  // 3년 월봉
};

interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface IndexData {
  name: string;
  code: string;
  price: number;
  change: number;
  changeRate: number;
  chart: CandleData[];
}

async function fetchIndex(code: string, name: string, periodKey: PeriodKey = '3m'): Promise<IndexData> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    authorization: `Bearer ${token}`,
    appkey: APP_KEY,
    appsecret: APP_SECRET,
    tr_id: 'FHKUP03500100',
    custtype: 'P',
  };

  const config = PERIOD_CONFIG[periodKey];
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - config.days);

  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'U',
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: fmt(startDate),
    FID_INPUT_DATE_2: fmt(endDate),
    FID_PERIOD_DIV_CODE: config.periodCode,
  });

  const res = await fetch(
    `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice?${params}`,
    { headers, cache: 'no-store' }
  );

  if (!res.ok) {
    throw new Error(`Index fetch failed: ${res.status}`);
  }

  const data = await res.json();
  const output1 = data.output1 || {};
  const output2 = (data.output2 || []) as Record<string, string>[];

  const chart: CandleData[] = output2
    .map((item) => ({
      date: item.stck_bsop_date,
      open: Number(item.bstp_nmix_oprc) || Number(item.bstp_nmix_prpr),
      high: Number(item.bstp_nmix_hgpr) || Number(item.bstp_nmix_prpr),
      low: Number(item.bstp_nmix_lwpr) || Number(item.bstp_nmix_prpr),
      close: Number(item.bstp_nmix_prpr),
    }))
    .filter((c) => c.close > 0)
    .reverse();

  return {
    name,
    code,
    price: Number(output1.bstp_nmix_prpr) || (chart.length > 0 ? chart[chart.length - 1].close : 0),
    change: Number(output1.bstp_nmix_prdy_vrss) || 0,
    changeRate: Number(output1.bstp_nmix_prdy_ctrt) || 0,
    chart,
  };
}

/** 투자자별 매매동향 (수급) 조회 — 실패 시 null 반환 */
interface InvestorData {
  frgn: number;   // 외국인 순매수 금액 (억원)
  inst: number;   // 기관 순매수 금액 (억원)
  prsn: number;   // 개인 순매수 금액 (억원)
}

async function fetchInvestor(code: string): Promise<InvestorData | null> {
  try {
    const token = await getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: APP_KEY,
      appsecret: APP_SECRET,
      tr_id: 'FHPTJ04400000',
      custtype: 'P',
    };

    const today = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'U',
      FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: fmt(today),
      FID_INPUT_DATE_2: fmt(today),
      FID_PERIOD_DIV_CODE: 'D',
    });

    const res = await fetch(
      `${BASE_URL}/uapi/domestic-stock/v1/quotations/foreign-institution-total?${params}`,
      { headers, cache: 'no-store' }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const items = data.output || data.output2 || data.output1;
    if (!items || (Array.isArray(items) && items.length === 0)) return null;

    // 첫 번째 항목에서 수급 데이터 추출 시도
    const item = Array.isArray(items) ? items[0] : items;

    // KIS API 필드명 후보들 시도
    const frgn = Number(item.frgn_ntby_tr_pbmn || item.frgn_pure_buy_tr_pbmn || item.frgn_ntby_qty || 0);
    const inst = Number(item.orgn_ntby_tr_pbmn || item.orgn_pure_buy_tr_pbmn || item.orgn_ntby_qty || 0);
    const prsn = Number(item.prsn_ntby_tr_pbmn || item.prsn_pure_buy_tr_pbmn || item.prsn_ntby_qty || 0);

    // 모두 0이면 데이터 없음
    if (frgn === 0 && inst === 0 && prsn === 0) return null;

    // 억 단위 변환 (원→억)
    return {
      frgn: Math.round(frgn / 100_000_000),
      inst: Math.round(inst / 100_000_000),
      prsn: Math.round(prsn / 100_000_000),
    };
  } catch {
    return null;
  }
}

/** 시장 데이터 fetch (공통) */
async function fetchMarketData(periodKey: PeriodKey) {
  const [kospi, kosdaq, kospiInv, kosdaqInv] = await Promise.all([
    fetchIndex('0001', 'KOSPI', periodKey),
    fetchIndex('1001', 'KOSDAQ', periodKey),
    fetchInvestor('0001'),
    fetchInvestor('1001'),
  ]);
  return {
    kospi: { ...kospi, investor: kospiInv },
    kosdaq: { ...kosdaq, investor: kosdaqInv },
    period: periodKey,
  };
}

/** 백그라운드 캐시 갱신 */
async function refreshCache(periodKey: PeriodKey, cacheKey: string) {
  const result = await fetchMarketData(periodKey);
  cacheMap.set(cacheKey, { data: result, fetchedAt: Date.now() });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get('period') || '3m') as PeriodKey;
  const validPeriod = PERIOD_CONFIG[period] ? period : '3m';
  const cacheKey = `market_${validPeriod}`;

  // 캐시 확인: 유효 캐시가 있으면 바로 반환
  const cached = cacheMap.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  if (!isKISConfigured()) {
    // KIS 미설정이라도 만료 캐시 있으면 반환
    if (cached) return NextResponse.json(cached.data);
    return NextResponse.json(
      { error: 'KIS API not configured' },
      { status: 503 }
    );
  }

  // 만료 캐시가 있으면 먼저 반환 + 백그라운드 갱신은 다음 호출에서
  // (Stale-While-Revalidate: 오래된 데이터라도 즉시 보여주기)
  if (cached) {
    // 백그라운드에서 갱신 (fire-and-forget)
    refreshCache(validPeriod, cacheKey).catch(() => {});
    return NextResponse.json(cached.data, {
      headers: { 'X-Cache': 'STALE' },
    });
  }

  // 캐시가 아예 없을 때만 동기 fetch
  try {
    const result = await fetchMarketData(validPeriod);
    cacheMap.set(cacheKey, { data: result, fetchedAt: Date.now() });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: `지수 조회 실패: ${error instanceof Error ? error.message : ''}` },
      { status: 500 }
    );
  }
}
