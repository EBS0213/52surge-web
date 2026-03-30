import { NextResponse } from 'next/server';
import { getCurrentPrice, isKISConfigured } from '../../../lib/kis-client';

export async function GET(request: Request) {
  if (!isKISConfigured()) {
    return NextResponse.json(
      { error: 'KIS API not configured. Set KIS_APP_KEY and KIS_APP_SECRET.' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'Missing code parameter' }, { status: 400 });
  }

  try {
    const price = await getCurrentPrice(code);
    return NextResponse.json(price, {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' },
    });
  } catch (error) {
    console.error('KIS price error:', error);
    return NextResponse.json({ error: 'Failed to fetch price' }, { status: 502 });
  }
}
