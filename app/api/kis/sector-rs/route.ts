/**
 * 업종별 RS(Relative Strength) API
 * GET /api/kis/sector-rs?period=20
 *
 * 각 업종의 N일 수익률을 KOSPI 대비 상대 강도로 계산.
 * RS = (업종 N일 수익률) / (KOSPI N일 수익률) × 100
 *  → RS > 100 = 시장 대비 강세 / RS < 100 = 약세
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  getSectorCurrentIndex,
  getSectorDailyChart,
  SECTOR_CODES,
  isKISConfigured,
} from '../../../lib/kis-client';

// 캐시: 10분
let cache: { data: unknown; fetchedAt: number; period: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  const period = Number(request.nextUrl.searchParams.get('period') || '20');
  const validPeriods = [5, 10, 20, 60, 120];
  const p = validPeriods.includes(period) ? period : 20;

  // 캐시 확인
  if (cache && cache.period === p && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cache.data, { headers: { 'X-Cache': 'HIT' } });
  }

  if (!isKISConfigured()) {
    return NextResponse.json({ error: 'KIS API not configured' }, { status: 503 });
  }

  try {
    // 날짜 계산 (N거래일 ≈ N*1.6 캘린더일)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Math.ceil(p * 1.8));

    const fmt = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

    const startStr = fmt(startDate);
    const endStr = fmt(endDate);

    // KOSPI (0001) 시세를 먼저 가져옴 — 벤치마크
    const kospiChart = await getSectorDailyChart('0001', startStr, endStr);
    if (kospiChart.length < 2) {
      console.error(`[sector-rs] KOSPI chart length=${kospiChart.length}, start=${startStr}, end=${endStr}`);
      return NextResponse.json(
        { error: '장 마감 후 또는 데이터 준비 중입니다. 잠시 후 다시 시도해주세요.' },
        { status: 503 }
      );
    }

    const kospiOld = kospiChart[0].close;
    const kospiNew = kospiChart[kospiChart.length - 1].close;
    const kospiReturn = kospiOld > 0 ? (kospiNew - kospiOld) / kospiOld : 0;

    // 각 업종별 RS 계산 (KOSPI 자체 제외)
    const sectors = SECTOR_CODES.filter((s) => s.code !== '0001');

    // 순차 호출 (KIS 레이트 리밋 방지: 2개씩 배치, 딜레이 확대)
    const BATCH = 2;
    const results: {
      code: string;
      name: string;
      currentIndex: number;
      change: number;
      changeRate: number;
      periodReturn: number;  // N일 수익률 (%)
      rs: number;            // RS 값
      rsRank: number;        // 순위 (나중에 채움)
    }[] = [];

    for (let i = 0; i < sectors.length; i += BATCH) {
      const batch = sectors.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(async (sector) => {
          try {
            // 현재 지수
            const current = await getSectorCurrentIndex(sector.code);
            // 기간별 시세
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
              rs: 0,       // 아래에서 백분위로 재계산
              rsRank: 0,
            };
          } catch (err) {
            console.error(`[sector-rs] ${sector.name} error:`, err);
            return null;
          }
        })
      );

      results.push(...batchResults.filter((r): r is NonNullable<typeof r> => r !== null));

      // 배치 간 300ms 딜레이 (레이트 리밋 방지)
      if (i + BATCH < sectors.length) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    // RS 0~100 백분위 스케일 변환
    // 수익률 기준으로 정렬 → 순위 → 백분위
    // RS = (순위 - 1) / (총 업종 수 - 1) × 100  (1등 = 100, 꼴찌 = 0)
    const n = results.length;
    results.sort((a, b) => a.periodReturn - b.periodReturn); // 오름차순 (약한→강한)
    results.forEach((r, idx) => {
      r.rs = n > 1 ? Math.round((idx / (n - 1)) * 10000) / 100 : 50;
    });

    // 최종 정렬: RS 내림차순 (강한 업종이 위로)
    results.sort((a, b) => b.rs - a.rs);
    results.forEach((r, idx) => { r.rsRank = idx + 1; });

    const data = {
      period: p,
      benchmark: {
        name: 'KOSPI',
        periodReturn: Math.round(kospiReturn * 10000) / 100,
        currentIndex: kospiNew,
      },
      sectors: results,
      updatedAt: new Date().toISOString(),
    };

    console.log(`[sector-rs] period=${p}: ${results.length} sectors`);
    cache = { data, fetchedAt: Date.now(), period: p };
    return NextResponse.json(data);
  } catch (error) {
    console.error('[sector-rs] error:', error);
    return NextResponse.json(
      { error: `업종 RS 조회 실패: ${error instanceof Error ? error.message : ''}` },
      { status: 500 }
    );
  }
}
