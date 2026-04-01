import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://3.37.194.236:8000';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분 캐시
const CACHE_FILE = join(process.cwd(), '.cache-scan.json');

// 인메모리 캐시
let cachedData: { data: unknown; timestamp: number; key: string } | null = null;

// 파일 캐시에서 복원 (PM2 재시작 시 즉시 응답)
function loadFileCache() {
  try {
    const raw = readFileSync(CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.data && parsed.timestamp) {
      cachedData = parsed;
      console.log('[scan] file cache restored');
    }
  } catch { /* 파일 없으면 무시 */ }
}

function saveFileCache() {
  try {
    if (cachedData) writeFileSync(CACHE_FILE, JSON.stringify(cachedData), 'utf-8');
  } catch { /* 쓰기 실패 무시 */ }
}

// 서버 시작 시 파일 캐시 복원 + 워밍업
loadFileCache();

let warmupDone = false;
function warmupScan() {
  if (warmupDone) return;
  warmupDone = true;
  fetchScanData('20')
    .then((data) => {
      cachedData = { data, timestamp: Date.now(), key: 'scan-20' };
      saveFileCache();
      console.log('[scan] cache warmed up');
    })
    .catch(() => {});
}
setTimeout(warmupScan, 5000); // market 워밍업 3초 후, scan은 5초 후

async function fetchScanData(maxResults: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const response = await fetch(
    `${BACKEND_URL}/api/stocks/scan?max_results=${maxResults}`,
    { signal: controller.signal, cache: 'no-store' }
  );
  clearTimeout(timeout);
  if (!response.ok) throw new Error(`Backend returned ${response.status}`);
  return response.json();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const maxResults = searchParams.get('max_results') || '20';
  const cacheKey = `scan-${maxResults}`;

  // 캐시 히트: 유효 캐시 즉시 반환
  if (
    cachedData &&
    cachedData.key === cacheKey &&
    Date.now() - cachedData.timestamp < CACHE_TTL_MS
  ) {
    return NextResponse.json(cachedData.data, {
      headers: { 'X-Cache': 'HIT' },
    });
  }

  // 만료 캐시 있으면 즉시 반환 + 백그라운드 갱신 (Stale-While-Revalidate)
  if (cachedData && cachedData.key === cacheKey) {
    fetchScanData(maxResults)
      .then((data) => {
        cachedData = { data, timestamp: Date.now(), key: cacheKey };
        saveFileCache();
      })
      .catch(() => {});
    return NextResponse.json(cachedData.data, {
      headers: { 'X-Cache': 'STALE' },
    });
  }

  // 캐시 없음 → 동기 fetch
  try {
    const data = await fetchScanData(maxResults);
    cachedData = { data, timestamp: Date.now(), key: cacheKey };
    saveFileCache();
    return NextResponse.json(data, {
      headers: { 'X-Cache': 'MISS' },
    });
  } catch (error) {
    // 아무 캐시라도 있으면 반환
    if (cachedData) {
      return NextResponse.json(cachedData.data, {
        headers: { 'X-Cache': 'ERROR-STALE' },
      });
    }
    console.error('Stock scan API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stocks', message: String(error) },
      { status: 502 }
    );
  }
}
