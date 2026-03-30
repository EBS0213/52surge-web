import { NextResponse } from 'next/server';
import { getDailyChart, isKISConfigured } from '../../../lib/kis-client';

export async function GET(request: Request) {
  if (!isKISConfigured()) {
    return NextResponse.json(
      { error: 'KIS API not configured. Set KIS_APP_KEY and KIS_APP_SECRET.' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const days = parseInt(searchParams.get('days') || '90', 10);

  if (!code) {
    return NextResponse.json({ error: 'Missing code parameter' }, { status: 400 });
  }

  // 기간 계산
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const fmt = (d: Date) =>
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');

  try {
    const candles = await getDailyChart(code, fmt(startDate), fmt(endDate));
    return NextResponse.json(candles, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('KIS chart error:', error);
    return NextResponse.json({ error: 'Failed to fetch chart data' }, { status: 502 });
  }
}
