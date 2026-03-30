import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const maxResults = searchParams.get('max_results') || '6';
  
  try {
    const response = await fetch(
      `http://13.124.156.73:8000/api/stocks/scan?max_results=${maxResults}`,
      { cache: 'no-store' }
    );
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch stocks' },
      { status: 500 }
    );
  }
}
