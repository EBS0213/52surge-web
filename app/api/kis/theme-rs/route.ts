/**
 * 테마별 RS(Relative Strength) API
 * GET /api/kis/theme-rs
 *
 * 269개 테마의 오늘 평균 등락률 기반 RS 계산.
 * 백그라운드에서 2,238개 고유 종목의 현재가를 순차 수집 → 테마별 집계 → RS 백분위.
 * 파일 캐시 기반으로 PM2 재시작 후에도 즉시 응답.
 */

import { NextResponse } from 'next/server';
import { getCurrentPrice, isKISConfigured } from '../../../lib/kis-client';
import { cacheGet, cacheSet, cacheGetStale } from '../../../lib/file-cache';
import themesData from '../../../data/themes.json';

const themes = themesData as Record<string, { name: string; stocks: string[] }>;

const STOCK_TTL = 10 * 60 * 1000;     // 개별 종목 캐시 10분 (장외 30분)
const THEME_RS_TTL = 5 * 60 * 1000;   // RS 결과 캐시 5분
const CACHE_KEY = 'theme-rs-all';

// 고유 종목 코드 추출
const allStockCodes = [...new Set(Object.values(themes).flatMap((t) => t.stocks))];

function stockCacheKey(code: string) { return `sp-${code}`; }

interface StockPrice {
  code: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  marketCap: number;
}

interface ThemeRS {
  code: string;
  name: string;
  stockCount: number;
  avgChangeRate: number;
  upCount: number;
  downCount: number;
  rs: number;
  rsRank: number;
  loaded: number;   // 가격 데이터 있는 종목 수
}

interface ThemeRSResponse {
  themes: ThemeRS[];
  updatedAt: string;
  progress: number;  // 0~100
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

// ── 테마 RS 계산 ──────────────────────────────────────────────────
function computeThemeRS(): ThemeRSResponse {
  const results: ThemeRS[] = Object.entries(themes).map(([code, theme]) => {
    let totalRate = 0;
    let upCount = 0;
    let downCount = 0;
    let loaded = 0;

    for (const sc of theme.stocks) {
      const p = priceMap.get(sc);
      if (p && p.price > 0) {
        totalRate += p.changeRate;
        if (p.changeRate > 0) upCount++;
        if (p.changeRate < 0) downCount++;
        loaded++;
      }
    }

    return {
      code,
      name: theme.name,
      stockCount: theme.stocks.length,
      avgChangeRate: loaded > 0 ? Math.round((totalRate / loaded) * 100) / 100 : 0,
      upCount,
      downCount,
      rs: 50,
      rsRank: 0,
      loaded,
    };
  });

  // RS = avgChangeRate 기준 백분위 (3개 이상 데이터 있는 테마만)
  const withData = results.filter((r) => r.loaded >= 3);
  const n = withData.length;
  withData.sort((a, b) => a.avgChangeRate - b.avgChangeRate);
  withData.forEach((r, idx) => {
    r.rs = n > 1 ? Math.round((idx / (n - 1)) * 100) : 50;
  });

  // RS 내림차순 정렬
  results.sort((a, b) => b.rs - a.rs || b.avgChangeRate - a.avgChangeRate);
  results.forEach((r, idx) => { r.rsRank = idx + 1; });

  const loadedStocks = priceMap.size;

  return {
    themes: results,
    updatedAt: new Date().toISOString(),
    progress: Math.round((loadedStocks / allStockCodes.length) * 100),
    totalStocks: allStockCodes.length,
    loadedStocks,
  };
}

// ── 백그라운드 종목가격 수집 ──────────────────────────────────────
let bgRunning = false;

async function backgroundFetchAll() {
  if (bgRunning || !isKISConfigured()) return;
  bgRunning = true;

  console.log(`[theme-rs] BG 수집 시작: ${allStockCodes.length}개 고유 종목`);
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
        const data = await getCurrentPrice(code);
        const sign = String(data.prdy_vrss_sign || '');
        const isDown = sign === '4' || sign === '5';

        const info: StockPrice = {
          code,
          name: data.hts_kor_isnm || code,
          price: Number(data.stck_prpr || 0),
          change: isDown
            ? -Math.abs(Number(data.prdy_vrss || 0))
            : Math.abs(Number(data.prdy_vrss || 0)),
          changeRate: isDown
            ? -Math.abs(Number(data.prdy_ctrt || 0))
            : Math.abs(Number(data.prdy_ctrt || 0)),
          volume: Number(data.acml_vol || 0),
          marketCap: Math.round(Number(data.stck_avls || 0) / 100_000_000),
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
    if (!success && errors === 0) errors++; // 3회 모두 레이트리밋이면 에러 카운트

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
