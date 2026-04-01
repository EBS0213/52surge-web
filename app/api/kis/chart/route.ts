import { NextResponse } from 'next/server';
import { getDailyChart, getCurrentPrice, isKISConfigured } from '../../../lib/kis-client';

// 기간 설정
const PERIOD_MAP: Record<string, { days: number; code: 'D' | 'W' | 'M' }> = {
  daily:   { days: 120, code: 'D' },   // 일봉: ~80거래일
  weekly:  { days: 400, code: 'W' },   // 주봉: ~55주
  monthly: { days: 1100, code: 'M' },  // 월봉: ~36개월
};

export async function GET(request: Request) {
  if (!isKISConfigured()) {
    return NextResponse.json(
      { error: 'KIS API not configured. Set KIS_APP_KEY and KIS_APP_SECRET.' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const period = searchParams.get('period') || 'daily';
  const withInfo = searchParams.get('info') === '1';

  if (!code) {
    return NextResponse.json({ error: 'Missing code parameter' }, { status: 400 });
  }

  const config = PERIOD_MAP[period] || PERIOD_MAP.daily;

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - config.days);

  const fmt = (d: Date) =>
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');

  try {
    // 차트 + (선택적) 기업정보 동시 요청
    const promises: [Promise<unknown>, Promise<unknown> | null] = [
      getDailyChart(code, fmt(startDate), fmt(endDate), config.code),
      withInfo ? getCurrentPrice(code) : null,
    ];

    const [candles, priceInfo] = await Promise.all([
      promises[0],
      promises[1] || Promise.resolve(null),
    ]);

    const result: Record<string, unknown> = { candles };
    if (priceInfo) {
      result.info = priceInfo;
    }

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('KIS chart error:', error);
    return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 502 });
  }
}
