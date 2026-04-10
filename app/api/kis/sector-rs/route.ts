/**
 * 업종별 RS(Relative Strength) API
 * GET /api/kis/sector-rs?period=20
 *
 * 모든 기간(5/10/20/60/120일)을 멀티 캐시로 관리.
 * 첫 요청 시 해당 기간 계산 후, 백그라운드로 나머지 기간도 미리 캐시.
 * 10분마다 자동 갱신 → 탭 전환 시 즉시 응답.
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  getSectorCurrentIndex,
  getSectorDailyChart,
  SECTOR_CODES,
  isKISConfigured,
} from '../../../lib/kis-client';

// ── 멀티 기간 캐시 ──────────────────────────────────────────────
const VALID_PERIODS = [5, 10, 20, 60, 120];
const CACHE_TTL = 10 * 60 * 1000; // 10분

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const periodCache = new Map<number, CacheEntry>();
let bgRefreshRunning = false;

// ── RS 계산 코어 ────────────────────────────────────────────────
async function computeRS(p: number) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Math.ceil(p * 1.8));

  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  const startStr = fmt(startDate);
  const endStr = fmt(endDate);

  // KOSPI 벤치마크
  const kospiChart = await getSectorDailyChart('0001', startStr, endStr);
  if (kospiChart.length < 2) {
    throw new Error(`KOSPI chart length=${kospiChart.length}`);
  }

  const kospiOld = kospiChart[0].close;
  const kospiNew = kospiChart[kospiChart.length - 1].close;
  const kospiReturn = kospiOld > 0 ? (kospiNew - kospiOld) / kospiOld : 0;

  // 업종별 RS
  const sectors = SECTOR_CODES.filter((s) => s.code !== '0001');
  const BATCH = 2;
  const results: {
    code: string;
    name: string;
    currentIndex: number;
    change: number;
    changeRate: number;
    periodReturn: number;
    rs: number;
    rsRank: number;
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
            rs: 0,
            rsRank: 0,
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

  // RS 백분위 계산
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
async function refreshAllPeriods() {
  if (bgRefreshRunning || !isKISConfigured()) return;
  bgRefreshRunning = true;
  console.log('[sector-rs] 백그라운드 캐시 갱신 시작');

  for (const p of VALID_PERIODS) {
    try {
      const data = await computeRS(p);
      periodCache.set(p, { data, fetchedAt: Date.now() });
      console.log(`[sector-rs] cached period=${p}: ${(data as { sectors: unknown[] }).sectors.length} sectors`);
    } catch (err) {
      console.error(`[sector-rs] bg refresh period=${p} error:`, err);
    }
    // 기간 간 1초 딜레이
    await new Promise((r) => setTimeout(r, 1000));
  }

  bgRefreshRunning = false;
  console.log('[sector-rs] 백그라운드 캐시 갱신 완료');
}

// ── 서버 시작 시 자동 캐시 + 주기적 갱신 ────────────────────────
let intervalStarted = false;
function ensureBackgroundRefresh() {
  if (intervalStarted) return;
  intervalStarted = true;

  // 서버 시작 후 5초 뒤 첫 캐시
  setTimeout(() => refreshAllPeriods(), 5000);

  // 10분마다 갱신
  setInterval(() => refreshAllPeriods(), CACHE_TTL);
}

// ── GET 핸들러 ──────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const period = Number(request.nextUrl.searchParams.get('period') || '20');
  const p = VALID_PERIODS.includes(period) ? period : 20;

  // 백그라운드 갱신 스케줄러 시작
  ensureBackgroundRefresh();

  // 캐시 확인
  const cached = periodCache.get(p);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: { 'X-Cache': 'HIT', 'X-Cache-Age': String(Math.round((Date.now() - cached.fetchedAt) / 1000)) },
    });
  }

  if (!isKISConfigured()) {
    return NextResponse.json({ error: 'KIS API not configured' }, { status: 503 });
  }

  try {
    // 캐시 미스: 직접 계산
    const data = await computeRS(p);
    periodCache.set(p, { data, fetchedAt: Date.now() });

    // 나머지 기간도 백그라운드로 미리 캐시
    const otherPeriods = VALID_PERIODS.filter((v) => v !== p && !periodCache.has(v));
    if (otherPeriods.length > 0) {
      // fire-and-forget
      (async () => {
        for (const op of otherPeriods) {
          try {
            await new Promise((r) => setTimeout(r, 2000));
            const d = await computeRS(op);
            periodCache.set(op, { data: d, fetchedAt: Date.now() });
            console.log(`[sector-rs] pre-cached period=${op}`);
          } catch (err) {
            console.error(`[sector-rs] pre-cache period=${op} error:`, err);
          }
        }
      })();
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[sector-rs] error:', error);

    // 만료된 캐시라도 있으면 반환 (stale-while-error)
    if (cached) {
      return NextResponse.json(cached.data, {
        headers: { 'X-Cache': 'STALE' },
      });
    }

    return NextResponse.json(
      { error: '장 마감 후 또는 데이터 준비 중입니다. 잠시 후 다시 시도해주세요.' },
      { status: 503 }
    );
  }
}
