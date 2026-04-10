/**
 * 테마별 RS(Relative Strength) API — 다기간(1일/5일/20일)
 * GET /api/kis/theme-rs
 *
 * 269개 테마의 평균 등락률 기반 RS 계산.
 * 백그라운드에서 2,238개 고유 종목의 일봉(getDailyChartWithInfo)을 순차 수집
 * → 1d/5d/20d 수익률 산출 → 테마별 집계 → RS 백분위.
 * 프론트에서 기간 전환 시 재호출 없이 client-side 토글.
 */

import { NextResponse } from 'next/server';
import { getStockPriceWithHistory, isKISConfigured } from '../../../lib/kis-client';
import { cacheGet, cacheSet, cacheGetStale } from '../../../lib/file-cache';
import themesData from '../../../data/themes.json';

const themes = themesData as Record<string, { name: string; stocks: string[] }>;

const STOCK_TTL = 10 * 60 * 1000;     // 개별 종목 캐시 10분
const THEME_RS_TTL = 5 * 60 * 1000;   // RS 결과 캐시 5분
const CACHE_KEY = 'theme-rs-all';

// 고유 종목 코드 추출
const allStockCodes = [...new Set(Object.values(themes).flatMap((t) => t.stocks))];

function stockCacheKey(code: string) { return `sp-${code}`; }

type Period = '1' | '5' | '20';

interface StockPrice {
  code: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;   // 1d %
  return5d: number;     // 5-day return %
  return20d: number;    // 20-day return %
  volume: number;
  marketCap: number;
}

interface ThemeRS {
  code: string;
  name: string;
  stockCount: number;
  avgReturn: Record<Period, number>;
  upCount: number;
  downCount: number;
  rs: Record<Period, number>;
  loaded: number;
}

interface ThemeRSResponse {
  themes: ThemeRS[];
  updatedAt: string;
  progress: number;
  totalStocks: number;
  loadedStocks: number;
}

// ── 인메모리 종목가격 맵 (빠른 집계용) ────────────────────────────
const priceMap = new Map<string, StockPrice>();

/** 서버 시작 시 파일 캐시에서 복원 */
function restoreFromFileCache() {
  let restored = 0;
  for (const code of allStockCodes) {
    const cached = cacheGet<StockPrice>(stockCacheKey(code), STOCK_TTL);
    if (cached) {
      priceMap.set(code, cached.data);
      restored++;
    }
  }
  if (restored > 0) {
    console.log(`[theme-rs] 파일 캐시 복원: ${restored}/${allStockCodes.length}`);
  }
}

// 모듈 로드 시 복원 (동기)
restoreFromFileCache();

// ── 수익률 계산 유틸 ─────────────────────────────────────────────
function computeReturns(dailyCloses: { date: string; close: number }[]) {
  const n = dailyCloses.length;
  if (n < 2) return { return5d: 0, return20d: 0 };

  const latest = dailyCloses[n - 1].close;
  const idx5 = Math.max(0, n - 6);
  const idx20 = Math.max(0, n - 21);
  const close5 = dailyCloses[idx5].close;
  const close20 = dailyCloses[idx20].close;

  return {
    return5d: close5 > 0 ? Math.round(((latest - close5) / close5) * 10000) / 100 : 0,
    return20d: close20 > 0 ? Math.round(((latest - close20) / close20) * 10000) / 100 : 0,
  };
}

// ── 테마 RS 계산 (전 기간) ───────────────────────────────────────
function computeThemeRS(): ThemeRSResponse {
  const results: ThemeRS[] = Object.entries(themes).map(([code, theme]) => {
    let total1d = 0;
    let total5d = 0;
    let total20d = 0;
    let upCount = 0;
    let downCount = 0;
    let loaded = 0;

    for (const sc of theme.stocks) {
      const p = priceMap.get(sc);
      if (p && p.price > 0) {
        total1d += p.changeRate;
        total5d += (p.return5d ?? 0);
        total20d += (p.return20d ?? 0);
        if (p.changeRate > 0) upCount++;
        if (p.changeRate < 0) downCount++;
        loaded++;
      }
    }

    const avg = (v: number) => loaded > 0 ? Math.round((v / loaded) * 100) / 100 : 0;

    return {
      code,
      name: theme.name,
      stockCount: theme.stocks.length,
      avgReturn: { '1': avg(total1d), '5': avg(total5d), '20': avg(total20d) },
      upCount,
      downCount,
      rs: { '1': 50, '5': 50, '20': 50 },
      loaded,
    };
  });

  // 기간별 RS 백분위 (3개 이상 데이터 있는 테마만)
  for (const period of ['1', '5', '20'] as Period[]) {
    const withData = results.filter((r) => r.loaded >= 3);
    const n = withData.length;
    withData.sort((a, b) => a.avgReturn[period] - b.avgReturn[period]);
    withData.forEach((r, idx) => {
      r.rs[period] = n > 1 ? Math.round((idx / (n - 1)) * 100) : 50;
    });
  }

  // 기본 정렬: RS 1d 내림차순
  results.sort((a, b) => b.rs['1'] - a.rs['1'] || b.avgReturn['1'] - a.avgReturn['1']);

  return {
    themes: results,
    updatedAt: new Date().toISOString(),
    progress: Math.round((priceMap.size / allStockCodes.length) * 100),
    totalStocks: allStockCodes.length,
    loadedStocks: priceMap.size,
  };
}

// ── YYYYMMDD 포맷 ────────────────────────────────────────────────
function fmtDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// ── 백그라운드 종목가격 수집 ──────────────────────────────────────
let bgRunning = false;

async function backgroundFetchAll() {
  if (bgRunning || !isKISConfigured()) return;
  bgRunning = true;

  const now = new Date();
  const endDate = fmtDate(now);
  const startDate = fmtDate(new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000));

  console.log(`[theme-rs] BG 수집 시작: ${allStockCodes.length}개 고유 종목 (${startDate}~${endDate})`);
  let fetched = 0;
  let skipped = 0;
  let errors = 0;

  for (const code of allStockCodes) {
    // 캐시 유효하면 스킵
    if (cacheGet<StockPrice>(stockCacheKey(code), STOCK_TTL)) {
      if (!priceMap.has(code)) {
        const c = cacheGet<StockPrice>(stockCacheKey(code), STOCK_TTL);
        if (c) priceMap.set(code, c.data);
      }
      skipped++;
      continue;
    }

    // 최대 2회 재시도 (레이트리밋 대응)
    let success = false;
    for (let attempt = 0; attempt < 3 && !success; attempt++) {
      try {
        const data = await getStockPriceWithHistory(code, startDate, endDate);
        const { return5d, return20d } = computeReturns(data.dailyCloses);

        const info: StockPrice = {
          code,
          name: data.name || code,
          price: data.price,
          change: data.change,
          changeRate: data.changeRate,
          return5d,
          return20d,
          volume: data.volume,
          marketCap: data.marketCap,
        };

        priceMap.set(code, info);
        cacheSet(stockCacheKey(code), info);
        fetched++;
        success = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('EGW00201') || msg.includes('초당')) {
          // 레이트리밋 → 대기 후 재시도
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        } else {
          errors++;
          break; // 다른 에러는 재시도 안 함
        }
      }
    }
    if (!success && errors === 0) errors++;

    // 100개마다 중간 결과 캐시
    if ((fetched + errors) % 100 === 0 && fetched > 0) {
      const data = computeThemeRS();
      cacheSet(CACHE_KEY, data);
      console.log(
        `[theme-rs] 진행: fetched=${fetched} skipped=${skipped} errors=${errors} / ${allStockCodes.length}`
      );
    }

    // 레이트리밋 방지 (500ms 간격)
    await new Promise((r) => setTimeout(r, 500));
  }

  // 최종 계산 & 캐시
  const finalData = computeThemeRS();
  cacheSet(CACHE_KEY, finalData);

  bgRunning = false;
  console.log(
    `[theme-rs] BG 완료: fetched=${fetched} skipped=${skipped} errors=${errors}`
  );
}

let intervalStarted = false;
function ensureBackground() {
  if (intervalStarted) return;
  intervalStarted = true;
  // 서버 시작 5초 후 첫 수집
  setTimeout(() => backgroundFetchAll(), 5000);
  // 10분마다 반복
  setInterval(() => backgroundFetchAll(), 10 * 60 * 1000);
}

// ── GET 핸들러 ──────────────────────────────────────────────────
export async function GET() {
  ensureBackground();

  // 캐시 확인
  const cached = cacheGet<ThemeRSResponse>(CACHE_KEY, THEME_RS_TTL);
  if (cached) {
    return NextResponse.json(cached.data, {
      headers: {
        'X-Cache': 'HIT',
        'X-Cache-Age': String(Math.round(cached.age / 1000)),
      },
    });
  }

  // 캐시 없으면 현재 priceMap 기반으로 계산
  const data = computeThemeRS();

  if (data.loadedStocks > 0) {
    cacheSet(CACHE_KEY, data);
  }

  // stale 캐시라도 확인
  if (data.loadedStocks === 0) {
    const stale = cacheGetStale<ThemeRSResponse>(CACHE_KEY);
    if (stale) {
      return NextResponse.json(stale, {
        headers: { 'X-Cache': 'STALE' },
      });
    }
  }

  return NextResponse.json(data, {
    headers: { 'X-Cache': 'MISS' },
  });
}
