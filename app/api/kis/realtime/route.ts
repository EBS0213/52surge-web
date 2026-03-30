import { NextResponse } from 'next/server';
import { getCurrentPrice, isKISConfigured } from '../../../lib/kis-client';

/**
 * 여러 종목의 현재가를 한번에 조회
 * GET /api/kis/realtime?codes=005930,000660,035720
 */
export async function GET(request: Request) {
  if (!isKISConfigured()) {
    return NextResponse.json(
      { error: 'KIS API not configured' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const codesParam = searchParams.get('codes');

  if (!codesParam) {
    return NextResponse.json({ error: 'Missing codes parameter' }, { status: 400 });
  }

  const codes = codesParam.split(',').slice(0, 10); // 최대 10개

  try {
    // 순차 호출 (한투 API 초당 호출 제한 대응)
    const results: Record<string, {
      price: number;
      change: number;
      changeRate: number;
      volume: number;
      high: number;
      low: number;
      open: number;
    }> = {};

    for (const code of codes) {
      try {
        const data = await getCurrentPrice(code.trim());
        results[code.trim()] = {
          price: Number(data.stck_prpr),
          change: Number(data.prdy_vrss),
          changeRate: Number(data.prdy_ctrt),
          volume: Number(data.acml_vol),
          high: Number(data.stck_hgpr),
          low: Number(data.stck_lwpr),
          open: Number(data.stck_oprc),
        };
        // 한투 API 속도 제한: 초당 20회 → 안전하게 60ms 대기
        await new Promise((r) => setTimeout(r, 60));
      } catch (err) {
        console.error(`Price fetch failed for ${code}:`, err);
      }
    }

    return NextResponse.json(results, {
      headers: {
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=15',
      },
    });
  } catch (error) {
    console.error('Realtime API error:', error);
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 502 });
  }
}
