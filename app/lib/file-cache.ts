/**
 * 파일 기반 영속 캐시
 *
 * 메모리 캐시 + .data/ 파일 백업.
 * PM2 재시작/빌드 후에도 캐시가 유지되어 첫 요청부터 빠르게 응답.
 * 장 시간(09:00~15:30) 외에는 캐시 TTL을 3배로 연장.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const CACHE_DIR = join(process.cwd(), '.data', 'cache');

// .data/cache 디렉토리 보장
try {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch { /* ignore */ }

interface CacheItem<T> {
  data: T;
  fetchedAt: number;
}

// 메모리 캐시
const memCache = new Map<string, CacheItem<unknown>>();

/** 현재 한국 장 시간인지 (KST 09:00~15:30, 평일) */
function isMarketHours(): boolean {
  const now = new Date();
  // KST = UTC + 9
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay(); // 0=일, 6=토
  if (day === 0 || day === 6) return false;
  const hour = kst.getUTCHours();
  const min = kst.getUTCMinutes();
  const t = hour * 60 + min;
  return t >= 540 && t <= 930; // 09:00 ~ 15:30
}

/** 실효 TTL 계산: 장 시간 외에는 3배 */
function effectiveTTL(baseTTL: number): number {
  return isMarketHours() ? baseTTL : baseTTL * 3;
}

function filePath(key: string): string {
  // 파일명 안전하게
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(CACHE_DIR, `${safe}.json`);
}

/** 캐시에서 읽기 (메모리 → 파일 순) */
export function cacheGet<T>(key: string, baseTTL: number): { data: T; age: number } | null {
  const ttl = effectiveTTL(baseTTL);

  // 1. 메모리 캐시
  const mem = memCache.get(key) as CacheItem<T> | undefined;
  if (mem && Date.now() - mem.fetchedAt < ttl) {
    return { data: mem.data, age: Date.now() - mem.fetchedAt };
  }

  // 2. 파일 캐시
  try {
    const raw = readFileSync(filePath(key), 'utf-8');
    const item: CacheItem<T> = JSON.parse(raw);
    if (Date.now() - item.fetchedAt < ttl) {
      // 메모리에도 복원
      memCache.set(key, item);
      return { data: item.data, age: Date.now() - item.fetchedAt };
    }
  } catch { /* miss */ }

  return null;
}

/** 캐시에 쓰기 (메모리 + 파일 동시) */
export function cacheSet<T>(key: string, data: T): void {
  const item: CacheItem<T> = { data, fetchedAt: Date.now() };
  memCache.set(key, item);

  // 파일에 비동기 저장 (실패해도 무시)
  try {
    writeFileSync(filePath(key), JSON.stringify(item));
  } catch (err) {
    console.error(`[file-cache] write ${key} error:`, err);
  }
}

/** 만료된 캐시라도 반환 (stale-while-error용) */
export function cacheGetStale<T>(key: string): T | null {
  // 메모리
  const mem = memCache.get(key) as CacheItem<T> | undefined;
  if (mem) return mem.data;

  // 파일
  try {
    const raw = readFileSync(filePath(key), 'utf-8');
    const item: CacheItem<T> = JSON.parse(raw);
    return item.data;
  } catch { /* miss */ }

  return null;
}
