/**
 * KOSPI / KOSDAQ 지수 현재가 + 차트 API
 * - 1일: 10분봉 (FHKUP03500200 업종 시간별 시세)
 * - 기타: 일/주/월봉 (FHKUP03500100 업종 기간별 시세)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getAccessToken, isKISConfigured } from '../../lib/kis-client';

const BASE_URL = process.env.KIS_BASE_URL || 'https://openapi.koreainvestment.com:9443';
const APP_KEY = process.env.KIS_APP_KEY || '';
const APP_SECRET = process.env.KIS_APP_SECRET || '';

// 캐시 - 기간별 캐시
const cacheMap = new Map<string, { data: unknown; fetchedAt: number }>();
const CACHE_TTL = 1 * 60 * 1000; // 1분 (장중 빠른 갱신)
const CACHE_FILE = join(process.cwd(), '.cache-market.json');

// 파일 캐시에서 복원 (PM2 재시작 시 즉시 응답)
function loadFileCache() {
  try {
    const raw = readFileSync(CACHE_FILE, 'utf-8');
    const entries: Record<string, { data: unknown; fetchedAt: number }> = JSON.parse(raw);
    for (const [key, val] of Object.entries(entries)) {
      cacheMap.set(key, val);
    }
    console.log('[market] file cache restored:', Object.keys(entries).join(', '));
  } catch { /* 파일 없으면 무시 */ }
}

function saveFileCache() {
  try {
    const obj: Record<string, unknown> = {};
    for (const [key, val] of cacheMap.entries()) {
      obj[key] = val;
    }
    writeFileSync(CACHE_FILE, JSON.stringify(obj), 'utf-8');
  } catch { /* 무시 */ }
}

// 서버 시작 시 파일 캐시 복원
loadFileCache();

// 서버 시작 시 일봉 캐시 워밍업 (첫 방문 대기 제거)
let warmupDone = false;
function warmupCache() {
  if (warmupDone || !isKISConfigured()) return;
  warmupDone = true;
  fetchMarketData('daily' as PeriodKey)
    .then((result) => {
      cacheMap.set('market_daily', { data: result, fetchedAt: Date.now() });
      saveFileCache();
      console.log('[market] daily cache warmed up');
    })
    .catch(() => {});
}
// 모듈 로드 시 워밍업 시작 (파일 캐시 없을 때만 의미 있지만 항상 갱신)
setTimeout(warmupCache, 3000);

// 기간 설정
// 캔들스틱(MA 시각화): daily(일봉), weekly(주봉), monthly(월봉)
// 선형(MA 비표시): 1d(1일 10분봉), 3m, 1y, 3y, 5y
type PeriodKey = 'daily' | 'weekly' | 'monthly' | '1d' | '3m' | '1y' | '3y' | '5y';
const PERIOD_CONFIG: Record<string, { days: number; periodCode: string }> = {
  'daily':   { days: 200, periodCode: 'D' },     // 일봉: 최근 200일 (MA50 표시를 위해 충분한 데이터)
  'weekly':  { days: 380, periodCode: 'W' },     // 주봉: 최근 약 52주
  'monthly': { days: 1095, periodCode: 'M' },    // 월봉: 최근 약 3년
  '1d':      { days: 15, periodCode: 'D' },       // 1일: 최근 10거래일 일봉
  '3m':      { days: 100, periodCode: 'D' },     // 3개월: 일봉 선형
  '1y':      { days: 380, periodCode: 'D' },     // 1년: 일봉 선형
  '3y':      { days: 1095, periodCode: 'W' },    // 3년: 주봉 선형
  '5y':      { days: 1825, periodCode: 'M' },    // 5년: 월봉 선형
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

/** 1분봉 → 10분봉 합산 */
function aggregateTo10Min(minutes: CandleData[]): CandleData[] {
  if (minutes.length === 0) return [];
  const buckets = new Map<string, CandleData>();

  for (const m of minutes) {
    // date: "HHMMSS" 형태 → 10분 단위 키
    const hh = m.date.slice(0, 2);
    const mm = m.date.slice(2, 4);
    const bucket = `${hh}${String(Math.floor(Number(mm) / 10) * 10).padStart(2, '0')}`;

    const existing = buckets.get(bucket);
    if (!existing) {
      buckets.set(bucket, { date: bucket, open: m.open, high: m.high, low: m.low, close: m.close });
    } else {
      existing.high = Math.max(existing.high, m.high);
      existing.low = Math.min(existing.low, m.low);
      existing.close = m.close; // 마지막 분봉의 종가
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** 업종 시간별 시세 (1분봉) — 반복 호출로 전체 장중 데이터 수집 */
async function fetchIndexIntraday(code: string, name: string): Promise<IndexData> {
  const token = await getAccessToken();

  const makeHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json; charset=utf-8',
    authorization: `Bearer ${token}`,
    appkey: APP_KEY,
    appsecret: APP_SECRET,
    tr_id: 'FHKUP03500200',
    custtype: 'P',
  });

  const allMinutes: CandleData[] = [];
  let latestPrice = 0;
  let change = 0;
  let changeRate = 0;

  // 시간대별로 여러 번 호출 (30건씩, 큰 시간→작은 시간 순)
  // 장 시간: 09:00 ~ 15:30, 10분봉이므로 대략 40개 → 1분봉 약 390개 → 13회 호출 필요
  // API 부담 줄이기 위해 주요 시간대만 호출 (6회)
  const timeSlots = ['153000', '140000', '123000', '113000', '100000', '090000'];

  for (const time of timeSlots) {
    try {
      const params = new URLSearchParams({
        FID_COND_MRKT_DIV_CODE: 'U',
        FID_INPUT_ISCD: code,
        FID_INPUT_HOUR_1: time,
        FID_PW_DATA_INCU_YN: 'N',
        FID_ETC_CLS_CODE: '',
      });

      const res = await fetch(
        `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-time-indexchartprice?${params}`,
        { headers: makeHeaders(), cache: 'no-store' }
      );

      if (!res.ok) continue;
      const data = await res.json();

      // output1에서 현재가 정보 (첫 호출에서만)
      if (latestPrice === 0 && data.output1) {
        latestPrice = Number(data.output1.bstp_nmix_prpr) || 0;
        change = Number(data.output1.bstp_nmix_prdy_vrss) || 0;
        changeRate = Number(data.output1.bstp_nmix_prdy_ctrt) || 0;
      }

      const items = (data.output2 || []) as Record<string, string>[];
      for (const item of items) {
        const time = item.stck_cntg_hour || item.bsop_hour;
        if (!time) continue;
        const close = Number(item.bstp_nmix_prpr);
        if (close <= 0) continue;

        allMinutes.push({
          date: time,
          open: Number(item.bstp_nmix_oprc) || close,
          high: Number(item.bstp_nmix_hgpr) || close,
          low: Number(item.bstp_nmix_lwpr) || close,
          close,
        });
      }

      // API rate limit
      await new Promise((r) => setTimeout(r, 100));
    } catch {
      // 개별 시간대 실패 무시
    }
  }

  // 중복 제거 (같은 시간대 데이터) + 정렬
  const seen = new Set<string>();
  const unique = allMinutes.filter((m) => {
    if (seen.has(m.date)) return false;
    seen.add(m.date);
    return true;
  });

  // 10분봉으로 합산
  const chart = aggregateTo10Min(unique);

  return {
    name,
    code,
    price: latestPrice || (chart.length > 0 ? chart[chart.length - 1].close : 0),
    change,
    changeRate,
    chart,
  };
}

/** 날짜 포맷 헬퍼 */
const fmtDate = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/** 단일 페이지 지수 데이터 요청 */
async function fetchIndexPage(
  code: string, token: string, headers: Record<string, string>,
  startDate: Date, endDate: Date, periodCode: string
): Promise<{ output1: Record<string, string>; chart: CandleData[] }> {
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'U',
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: fmtDate(startDate),
    FID_INPUT_DATE_2: fmtDate(endDate),
    FID_PERIOD_DIV_CODE: periodCode,
  });

  const res = await fetch(
    `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice?${params}`,
    { headers, cache: 'no-store' }
  );

  if (!res.ok) throw new Error(`Index fetch failed: ${res.status}`);
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
    .filter((c) => c.close > 0);

  return { output1, chart };
}

/**
 * 페이지네이션 설정: MA50 + DISPLAY_CANDLES(60)에 충분한 데이터 확보
 * - daily:  최소 200 거래일 필요 → 2페이지 (200일 + 200일)
 * - weekly: 최소 110주 필요 → 2페이지 (400일 + 400일)
 * - monthly: 36개월 정도면 MA20까지 가능 (MA50은 구조적 한계)
 */
const PAGINATION_RANGES: Record<string, { page1Days: number; page2Days: number } | null> = {
  daily:   { page1Days: 200, page2Days: 400 },  // 0~200일, 201~400일
  weekly:  { page1Days: 400, page2Days: 800 },  // 0~400일, 401~800일
  monthly: null, // 단일 호출 (1095일 = 3년)
};

/** 업종 기간별 시세 (일/주/월봉) — 페이지네이션으로 충분한 데이터 확보 */
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
  const today = new Date();
  const paginationConfig = PAGINATION_RANGES[periodKey];

  // 페이지네이션이 필요한 기간 (daily, weekly)
  if (paginationConfig) {
    const { page1Days, page2Days } = paginationConfig;

    // 1차: 최근 데이터
    const start1 = new Date();
    start1.setDate(today.getDate() - page1Days);

    // 2차: 과거 데이터
    const end2 = new Date();
    end2.setDate(today.getDate() - page1Days - 1);
    const start2 = new Date();
    start2.setDate(today.getDate() - page2Days);

    // 순차 호출 (API rate limit)
    const page1 = await fetchIndexPage(code, token, headers, start1, today, config.periodCode);
    await new Promise((r) => setTimeout(r, 100));
    const page2 = await fetchIndexPage(code, token, headers, start2, end2, config.periodCode);

    // 합산 + 날짜 기준 중복 제거 + 정렬
    const all = [...page1.chart, ...page2.chart];
    const seen = new Set<string>();
    const deduped = all.filter((c) => {
      if (!c.date || seen.has(c.date)) return false;
      seen.add(c.date);
      return true;
    });

    // 날짜 오름차순 정렬 (과거→최신) — 이게 핵심!
    const chart = deduped.sort((a, b) => a.date.localeCompare(b.date));

    console.log(`[market] ${name} ${periodKey}: page1=${page1.chart.length}, page2=${page2.chart.length}, merged=${chart.length}`);

    return {
      name,
      code,
      price: Number(page1.output1.bstp_nmix_prpr) || (chart.length > 0 ? chart[chart.length - 1].close : 0),
      change: Number(page1.output1.bstp_nmix_prdy_vrss) || 0,
      changeRate: Number(page1.output1.bstp_nmix_prdy_ctrt) || 0,
      chart,
    };
  }

  // 페이지네이션 불필요 (monthly, 단기) → 단일 호출
  const startDate = new Date();
  startDate.setDate(today.getDate() - config.days);

  const page = await fetchIndexPage(code, token, headers, startDate, today, config.periodCode);
  // 날짜 오름차순 정렬
  const chart = page.chart.sort((a, b) => a.date.localeCompare(b.date));

  return {
    name,
    code,
    price: Number(page.output1.bstp_nmix_prpr) || (chart.length > 0 ? chart[chart.length - 1].close : 0),
    change: Number(page.output1.bstp_nmix_prdy_vrss) || 0,
    changeRate: Number(page.output1.bstp_nmix_prdy_ctrt) || 0,
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

    const params = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: 'U',
      FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: fmtDate(today),
      FID_INPUT_DATE_2: fmtDate(today),
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
  saveFileCache();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = (searchParams.get('period') || 'daily') as PeriodKey;
  const validPeriod = (PERIOD_CONFIG[period] || period === '1d') ? period : 'daily';
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
    saveFileCache();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: `지수 조회 실패: ${error instanceof Error ? error.message : ''}` },
      { status: 500 }
    );
  }
}
