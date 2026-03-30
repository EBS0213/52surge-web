/**
 * KOSPI / KOSDAQ 지수 현재가 + 일봉 OHLC 차트 API
 * KIS OpenAPI: 국내 주식 업종 기간별 시세 (FHKUP03500100)
 */

import { NextResponse } from 'next/server';
import { getAccessToken, isKISConfigured } from '../../lib/kis-client';

const BASE_URL = process.env.KIS_BASE_URL || 'https://openapi.koreainvestment.com:9443';
const APP_KEY = process.env.KIS_APP_KEY || '';
const APP_SECRET = process.env.KIS_APP_SECRET || '';

// 캐시 (5분)
let cache: { data: unknown; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

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

async function fetchIndex(code: string, name: string): Promise<IndexData> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    authorization: `Bearer ${token}`,
    appkey: APP_KEY,
    appsecret: APP_SECRET,
    tr_id: 'FHKUP03500100',
    custtype: 'P',
  };

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);

  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'U',
    FID_INPUT_ISCD: code,
    FID_INPUT_DATE_1: fmt(startDate),
    FID_INPUT_DATE_2: fmt(endDate),
    FID_PERIOD_DIV_CODE: 'D',
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

export async function GET() {
  // 캐시 확인
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(cache.data);
  }

  if (!isKISConfigured()) {
    return NextResponse.json(
      { error: 'KIS API not configured' },
      { status: 503 }
    );
  }

  try {
    const [kospi, kosdaq] = await Promise.all([
      fetchIndex('0001', 'KOSPI'),
      fetchIndex('1001', 'KOSDAQ'),
    ]);

    const result = { kospi, kosdaq };
    cache = { data: result, fetchedAt: Date.now() };
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: `지수 조회 실패: ${error instanceof Error ? error.message : ''}` },
      { status: 500 }
    );
  }
}
