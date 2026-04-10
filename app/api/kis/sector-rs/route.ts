/**
 * 업종별 RS(Relative Strength) API
 * GET /api/kis/sector-rs?period=20
 *
 * 파일 캐시 기반: PM2 재시작 후에도 즉시 응답.
 * 백그라운드 갱신: 10분 주기(장외 30분)로 모든 기간 프리캐시.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  getSectorCurrentIndex,
  getSectorDailyChart,
  SECTOR_CODES,
  isKISConfigured,
} from '../../../lib/kis-client';
import { cacheGet, cacheSet, cacheGetStale } from '../../../lib/file-cache';

const VALID_PERIODS = [5, 10, 20, 60, 120];
const CACHE_TTL = 10 * 60 * 1000; // 10분 (장외 자동 3배)

function cacheKey(p: number) { return `sector-rs-${p}`; }

// ── RS 계산 코어 ────────────────────────────────────────────────
async function computeRS(p: number) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Math.ceil(p * 1.8));

  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  const startStr = fmt(startDate);
  const endStr = fmt(endDate);

  const kospiChart = await getSectorDailyChart('0001', startStr, endStr);
  if (kospiChart.length < 2) {
    throw new Error(`KOSPI chart length=${kospiChart.length}`);
  }

  const kospiOld = kospiChart[0].close;
  const kospiNew = kospiChart[kospiChart.length - 1].close;
  const kospiReturn = kospiOld > 0 ? (kospiNew - kospiOld) / kospiOld : 0;

  const sectors = SECTOR_CODES.filter((s) => s.code !== '0001');
  const BATCH = 2;
  const results: {
    code: string; name: string; currentIndex: number;
    change: number; changeRate: number; periodReturn: number;
    rs: number; rsRank: number;
  }[] = [];

  for (let i = 0; i < sectors.length; i += BATCH) {
    const batch = sectors.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map(async (sector) => {
        try {
          const current = await getSectorCurrentIndex(sector.code);
          const chart = await getSectorDailyChart(sector.code, startStr, endStr);
          if (!chart || chart.length < 2) return null;

          const oldPrice = chart[0].close;
          const newPrice = chart[chart.length - 1].close;
          const sectorReturn = oldPrice > 0 ? (newPrice - oldPrice) / oldPrice : 0;

          return {
            code: sector.code,
            name: current?.name || sector.name,
            currentIndex: current?.currentIndex || newPrice,
            change: current?.change || 0,
            changeRate: current?.changeRate || 0,
            periodReturn: Math.round(sectorReturn * 10000) / 100,
            rs: 0, rsRank: 0,
          };
        } catch (err) {
          console.error(`[sector-rs] ${sector.name} error:`, err);
          return null;
        }
      })
    );
    results.push(...batchResults.filter((r): r is NonNullable<typeof r> => r !== null));
    if (i + BATCH < sectors.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const n = results.length;
  results.sort((a, b) => a.periodReturn - b.periodReturn);
  results.forEach((r, idx) => {
    r.rs = n > 1 ? Math.round((idx / (n - 1)) * 10000) / 100 : 50;
  });
  results.sort((a, b) => b.rs - a.rs);
  results.forEach((r, idx) => { r.rsRank = idx + 1; });

  return {
    period: p,
    benchmark: {
      name: 'KOSPI',
      periodReturn: Math.round(kospiReturn * 10000) / 100,
      currentIndex: kospiNew,
    },
    sectors: results,
    updatedAt: new Date().toISOString(),
  };
}

// ── 백그라운드 전체 기간 캐시 갱신 ─────────────────────────────
let bgRunning = false;
async function refreshAllPeriods() {
  if (bgRunning || !isKISConfigured()) return;
  bgRunning = true;
  console.log('[sector-rs] 백그라운드 캐시 갱신 시작');
  for (const p of VALID_PERIODS) {
    try {
      const data = await computeRS(p);
      cacheSet(cacheKey(p), data);
      console.log(`[sector-rs] cached period=${p}`);
    } catch (err) {
      console.error(`[sector-rs] bg period=${p} error:`, err);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  bgRunning = false;
  console.log('[sector-rs] 백그라운드 캐시 갱신 완료');
}

let intervalStarted = false;
function ensureBackgroundRefresh() {
  if (intervalStarted) return;
  intervalStarted = true;
  // 서버 시작 3초 후 첫 갱신
  setTimeout(() => refreshAllPeriods(), 3000);
  // 10분마다 반복
  setInterval(() => refreshAllPeriods(), 10 * 60 * 1000);
}

// ── GET 핸들러 ──────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const period = Number(request.nextUrl.searchParams.get('period') || '20');
  const p = VALID_PERIODS.includes(period) ? period : 20;

  ensureBackgroundRefresh();

  // 파일 캐시 확인 (장외에는 TTL 3배)
  const cached = cacheGet(cacheKey(p), CACHE_TTL);
  if (cached) {
    return NextResponse.json(cached.data, {
      headers: { 'X-Cache': 'HIT', 'X-Cache-Age': String(Math.round(cached.age / 1000)) },
    });
  }

  if (!isKISConfigured()) {
    return NextResponse.json({ error: 'KIS API not configured' }, { status: 503 });
  }

  try {
    const data = await computeRS(p);
    cacheSet(cacheKey(p), data);

    // 나머지 기간 백그라운드 프리캐시
    const others = VALID_PERIODS.filter((v) => v !== p && !cacheGet(cacheKey(v), CACHE_TTL));
    if (others.length > 0) {
      (async () => {
        for (const op of others) {
          try {
            await new Promise((r) => setTimeout(r, 2000));
            const d = await computeRS(op);
            cacheSet(cacheKey(op), d);
          } catch { /* ignore */ }
        }
      })();
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[sector-rs] error:', error);
    const stale = cacheGetStale(cacheKey(p));
    if (stale) {
      return NextResponse.json(stale, { headers: { 'X-Cache': 'STALE' } });
    }
    return NextResponse.json(
      { error: '장 마감 후 또는 데이터 준비 중입니다. 잠시 후 다시 시도해주세요.' },
      { status: 503 }
    );
  }
}
