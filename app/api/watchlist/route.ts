/**
 * 터틀 트레이딩 워치리스트 API
 *
 * GET  - 워치리스트 조회 (스캔 종목 자동 편입 + 매도 시그널/14일 경과 편출)
 * POST - 설정값 업데이트 또는 종목 수동 추가
 * DELETE - 종목 수동 편출
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getDailyChart, getCurrentPrice, isKISConfigured } from '../../lib/kis-client';
import {
  calculateN,
  calculatePosition,
  checkSellSignal,
  countTradingDays,
  getHighN,
  getLowN,
  isSystem1Entry,
  isSystem2Entry,
  DEFAULT_TURTLE_SETTINGS,
} from '../../lib/turtle';
import type {
  TurtleSettings,
  WatchlistEntry,
  WatchlistStock,
  ChartCandle,
} from '../../types/stock';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// ── 영속 저장 (JSON 파일) ──
const DATA_DIR = join(process.cwd(), '.data');
const WATCHLIST_FILE = join(DATA_DIR, 'watchlist.json');

interface PersistedState {
  settings: TurtleSettings;
  entries: WatchlistEntry[];
}

function loadState(): PersistedState {
  try {
    if (existsSync(WATCHLIST_FILE)) {
      const raw = readFileSync(WATCHLIST_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedState;
      return {
        settings: { ...DEFAULT_TURTLE_SETTINGS, ...parsed.settings },
        entries: parsed.entries || [],
      };
    }
  } catch { /* 파일 손상 시 기본값 사용 */ }
  return { settings: { ...DEFAULT_TURTLE_SETTINGS }, entries: [] };
}

function saveState(settings: TurtleSettings, entries: WatchlistEntry[]) {
  try {
    const { mkdirSync } = require('fs');
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(WATCHLIST_FILE, JSON.stringify({ settings, entries }, null, 2), 'utf-8');
  } catch (err) {
    console.error('워치리스트 저장 실패:', err);
  }
}

// ── 상태 초기화 (파일에서 로드) ──
const initialState = loadState();
let savedSettings: TurtleSettings = initialState.settings;
let savedEntries: WatchlistEntry[] = initialState.entries;

// 캐시: 차트 데이터 (종목코드 -> { candles, fetchedAt })
const chartCache = new Map<string, { candles: ChartCandle[]; fetchedAt: number }>();
const CHART_CACHE_TTL = 1 * 60 * 1000; // 1분

// 스캔 데이터 캐시
let scanCache: { data: { stocks: Array<{ code: string; name: string; close: number }> }; fetchedAt: number } | null = null;
const SCAN_CACHE_TTL = 1 * 60 * 1000; // 1분

/** 차트 데이터 가져오기 (캐시 포함) */
async function getCachedChart(code: string, days: number = 90): Promise<ChartCandle[]> {
  const cached = chartCache.get(code);
  if (cached && Date.now() - cached.fetchedAt < CHART_CACHE_TTL) {
    return cached.candles;
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  try {
    const candles = await getDailyChart(code, fmt(startDate), fmt(endDate));
    chartCache.set(code, { candles, fetchedAt: Date.now() });
    return candles;
  } catch {
    return cached?.candles || [];
  }
}

/** 백엔드에서 스캔 종목 가져오기 */
async function getScanStocks(): Promise<Array<{ code: string; name: string; close: number }>> {
  if (scanCache && Date.now() - scanCache.fetchedAt < SCAN_CACHE_TTL) {
    return scanCache.data.stocks;
  }

  const backendUrl = process.env.BACKEND_API_URL || 'http://13.124.156.73:8000';
  try {
    const res = await fetch(`${backendUrl}/api/stocks/scan?max_results=50`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
    const data = await res.json();
    scanCache = { data, fetchedAt: Date.now() };
    return data.stocks || [];
  } catch {
    return scanCache?.data.stocks || [];
  }
}

/** 오늘 날짜 (YYYY-MM-DD) */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 워치리스트 종목 상세 정보 계산 */
async function enrichEntry(
  entry: WatchlistEntry,
  settings: TurtleSettings
): Promise<WatchlistStock> {
  const candles = await getCachedChart(entry.code, 90);
  let currentPrice = entry.entryPrice;

  // 현재가 조회
  if (isKISConfigured()) {
    try {
      const priceData = await getCurrentPrice(entry.code);
      currentPrice = Number(priceData.stck_prpr) || entry.entryPrice;
    } catch { /* fallback to entry price */ }
  }

  const nValue = calculateN(candles);
  const pos = calculatePosition(entry.entryPrice, currentPrice, settings);
  const tradingDays = countTradingDays(entry.entryDate, today());

  // N일 고가/저가 계산
  const high20d = candles.length >= 20 ? getHighN(candles.slice(-20), 20) : 0;
  const low10d = candles.length >= 10 ? getLowN(candles.slice(-10), 10) : 0;
  const high55d = candles.length >= 55 ? getHighN(candles.slice(-55), 55) : 0;
  const low20d = candles.length >= 20 ? getLowN(candles.slice(-20), 20) : 0;

  // 매도 시그널 확인
  const sellCheck = checkSellSignal(
    entry.system,
    currentPrice,
    pos.stopPrice,
    tradingDays,
    candles
  );

  return {
    code: entry.code,
    name: entry.name,
    system: entry.system,
    entryDate: entry.entryDate,
    entryPrice: entry.entryPrice,
    currentPrice,
    high20d,
    low10d,
    high55d,
    low20d,
    nValue,
    unitSize: pos.unitSize,
    unitAmount: pos.positionAmount,
    stopPrice: pos.stopPrice,
    riskPerShare: pos.riskPerShare,
    positionPct: pos.positionPct,
    rrr: pos.rrr,
    pnlPct: pos.pnlPct,
    tradingDays,
    sellSignal: sellCheck.signal,
    sellReason: sellCheck.reason,
  };
}

// ── GET: 워치리스트 조회 ──
export async function GET() {
  try {
    // 1. 스캔 종목 가져와서 새로운 진입 시그널 확인
    const scanStocks = await getScanStocks();
    const existingCodes = new Set(savedEntries.map((e) => e.code));

    // 스캔 종목 중 아직 편입되지 않은 종목에 대해 시그널 확인
    for (const stock of scanStocks) {
      if (existingCodes.has(stock.code)) continue;

      try {
        const candles = await getCachedChart(stock.code, 90);
        if (candles.length < 20) continue;

        // 시스템1 진입: 20일 최고가 돌파
        if (isSystem1Entry(stock.close, candles)) {
          savedEntries.push({
            code: stock.code,
            name: stock.name,
            system: 'system1',
            entryDate: today(),
            entryPrice: stock.close,
          });
          existingCodes.add(stock.code);
          continue;
        }

        // 시스템2 진입: 55일 최고가 돌파
        if (candles.length >= 55 && isSystem2Entry(stock.close, candles)) {
          savedEntries.push({
            code: stock.code,
            name: stock.name,
            system: 'system2',
            entryDate: today(),
            entryPrice: stock.close,
          });
          existingCodes.add(stock.code);
        }
      } catch {
        // 개별 종목 실패 시 건너뜀
      }

      // KIS API rate limiting
      await new Promise((r) => setTimeout(r, 80));
    }

    // 스캔 후 변경사항 저장
    saveState(savedSettings, savedEntries);

    // 2. 각 편입 종목 상세 정보 계산
    const enrichedStocks: WatchlistStock[] = [];

    for (const entry of savedEntries) {
      try {
        const stock = await enrichEntry(entry, savedSettings);
        enrichedStocks.push(stock);
      } catch {
        // enrich 실패 시에도 기본 정보로 표시 (종목이 사라지지 않도록)
        enrichedStocks.push({
          code: entry.code,
          name: entry.name,
          system: entry.system,
          entryDate: entry.entryDate,
          entryPrice: entry.entryPrice,
          currentPrice: entry.entryPrice,
          high20d: 0, low10d: 0, high55d: 0, low20d: 0,
          nValue: 0, unitSize: 0, unitAmount: 0,
          stopPrice: 0, riskPerShare: 0, positionPct: 0, rrr: 0,
          pnlPct: 0, tradingDays: 0,
          sellSignal: false,
          sellReason: undefined,
        });
      }
      await new Promise((r) => setTimeout(r, 80));
    }

    // 3. 매도 시그널 종목은 삭제하지 않고 sellSignal=true로 표시만 유지
    // 실제 편출은 수동 DELETE 호출로만 처리 (자동 삭제 제거 — 간헐적 종목 소실 버그 방지)

    return NextResponse.json({
      settings: savedSettings,
      stocks: enrichedStocks,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `워치리스트 조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}` },
      { status: 500 }
    );
  }
}

// ── POST: 설정 업데이트 또는 종목 수동 추가 ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 설정 업데이트
    if (body.action === 'updateSettings' && body.settings) {
      savedSettings = { ...savedSettings, ...body.settings };
      saveState(savedSettings, savedEntries);
      return NextResponse.json({ success: true, settings: savedSettings });
    }

    // 종목 수동 추가
    if (body.action === 'addStock' && body.entry) {
      const entry: WatchlistEntry = {
        code: body.entry.code,
        name: body.entry.name,
        system: body.entry.system || 'system1',
        entryDate: body.entry.entryDate || today(),
        entryPrice: body.entry.entryPrice,
      };

      // 중복 확인
      if (savedEntries.some((e) => e.code === entry.code)) {
        return NextResponse.json(
          { error: '이미 워치리스트에 포함된 종목입니다.' },
          { status: 409 }
        );
      }

      savedEntries.push(entry);
      saveState(savedSettings, savedEntries);
      return NextResponse.json({ success: true, entry });
    }

    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: `요청 처리 실패: ${error instanceof Error ? error.message : ''}` },
      { status: 500 }
    );
  }
}

// ── DELETE: 종목 편출 ──
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ error: '종목 코드가 필요합니다.' }, { status: 400 });
    }

    const before = savedEntries.length;
    savedEntries = savedEntries.filter((e) => e.code !== code);

    if (savedEntries.length === before) {
      return NextResponse.json({ error: '해당 종목이 워치리스트에 없습니다.' }, { status: 404 });
    }

    saveState(savedSettings, savedEntries);
    return NextResponse.json({ success: true, removed: code });
  } catch (error) {
    return NextResponse.json(
      { error: `편출 실패: ${error instanceof Error ? error.message : ''}` },
      { status: 500 }
    );
  }
}
