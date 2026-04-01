/**
 * 터틀 트레이딩 워치리스트 API
 *
 * GET  - 워치리스트 조회 (스캔 종목 자동 편입 + 매도 시그널/14일 경과 편출)
 * POST - 설정값 업데이트 또는 종목 수동 추가
 * DELETE - 종목 수동 편출
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getDailyChart } from '../../lib/kis-client';
import {
  calculateN,
  calculatePosition,
  checkSellSignal,
  countTradingDays,
  getHighN,
  getLowN,
  DEFAULT_TURTLE_SETTINGS,
} from '../../lib/turtle';
import type {
  TurtleSettings,
  WatchlistEntry,
  WatchlistStock,
  ChartCandle,
  ArchivedEntry,
} from '../../types/stock';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// ── 영속 저장 (JSON 파일) ──
const DATA_DIR = join(process.cwd(), '.data');
const WATCHLIST_FILE = join(DATA_DIR, 'watchlist.json');

interface PersistedState {
  settings: TurtleSettings;
  entries: WatchlistEntry[];
  archive: ArchivedEntry[];
}

const ARCHIVE_RETENTION_DAYS = 21; // 3주 보관

function loadState(): PersistedState {
  try {
    if (existsSync(WATCHLIST_FILE)) {
      const raw = readFileSync(WATCHLIST_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedState;
      return {
        settings: { ...DEFAULT_TURTLE_SETTINGS, ...parsed.settings },
        entries: parsed.entries || [],
        archive: parsed.archive || [],
      };
    }
  } catch { /* 파일 손상 시 기본값 사용 */ }
  return { settings: { ...DEFAULT_TURTLE_SETTINGS }, entries: [], archive: [] };
}

function saveState(settings: TurtleSettings, entries: WatchlistEntry[], archive?: ArchivedEntry[]) {
  try {
    const { mkdirSync } = require('fs');
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(WATCHLIST_FILE, JSON.stringify({ settings, entries, archive: archive ?? savedArchive }, null, 2), 'utf-8');
  } catch (err) {
    console.error('워치리스트 저장 실패:', err);
  }
}

/** 아카이브에서 3주 지난 항목 정리 */
function cleanExpiredArchive(archive: ArchivedEntry[]): ArchivedEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ARCHIVE_RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return archive.filter((a) => a.archivedAt >= cutoffStr);
}

// ── 상태 초기화 (파일에서 로드) ──
const initialState = loadState();
let savedSettings: TurtleSettings = initialState.settings;
let savedEntries: WatchlistEntry[] = initialState.entries;
let savedArchive: ArchivedEntry[] = initialState.archive;

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

/** 스캔 종목 타입 (터틀 돌파 플래그 포함) */
interface ScanStock {
  code: string;
  name: string;
  close: number;
  breakout_20d?: boolean;
  breakout_55d?: boolean;
  high_20d?: number;
  high_55d?: number;
}

/** 백엔드에서 스캔 종목 가져오기 (전체) */
async function getScanStocks(): Promise<ScanStock[]> {
  if (scanCache && Date.now() - scanCache.fetchedAt < SCAN_CACHE_TTL) {
    return scanCache.data.stocks;
  }

  const backendUrl = process.env.BACKEND_API_URL || 'http://3.37.194.236:8000';
  try {
    const res = await fetch(`${backendUrl}/api/stocks/scan?max_results=2000`, {
      signal: AbortSignal.timeout(15_000),
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

/** 워치리스트 종목 상세 정보 계산 (scanPrice: 스캐너에서 받은 현재가) */
async function enrichEntry(
  entry: WatchlistEntry,
  settings: TurtleSettings,
  scanPrice?: number
): Promise<WatchlistStock> {
  const candles = await getCachedChart(entry.code, 90);
  // 스캐너 현재가 우선 사용 → KIS API 호출 제거 (성능 개선)
  let currentPrice = scanPrice || entry.entryPrice;

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

    // 아카이브에서 3주 지난 항목 정리
    savedArchive = cleanExpiredArchive(savedArchive);
    const archivedCodes = new Set(savedArchive.map((a) => a.code));

    // 스캔 종목 중 아직 편입되지 않은 종목에 대해 돌파 플래그로 시그널 확인
    // (스캐너가 이미 2000개 전체에 대해 20일/55일 돌파를 계산해놓음 → KIS API 불필요)
    const newStocks = scanStocks.filter((s) => !existingCodes.has(s.code));

    for (const stock of newStocks) {
      // 이미 편입된 종목의 시스템 목록 (같은 종목이 system1, system2 둘 다 들어갈 수 있음)
      const existingSystems = new Set(
        savedEntries.filter((e) => e.code === stock.code).map((e) => e.system)
      );

      // 시스템1: 20일 돌파
      if (stock.breakout_20d && !existingSystems.has('system1')) {
        savedEntries.push({
          code: stock.code,
          name: stock.name,
          system: 'system1',
          entryDate: today(),
          entryPrice: stock.close,
        });
        if (archivedCodes.has(stock.code)) {
          savedArchive = savedArchive.filter((a) => a.code !== stock.code);
          archivedCodes.delete(stock.code);
        }
      }

      // 시스템2: 55일 돌파 (20일 돌파와 독립적으로 체크 — 둘 다 해당되면 둘 다 편입)
      if (stock.breakout_55d && !existingSystems.has('system2')) {
        savedEntries.push({
          code: stock.code,
          name: stock.name,
          system: 'system2',
          entryDate: today(),
          entryPrice: stock.close,
        });
        if (archivedCodes.has(stock.code)) {
          savedArchive = savedArchive.filter((a) => a.code !== stock.code);
          archivedCodes.delete(stock.code);
        }
      }

      existingCodes.add(stock.code);
    }

    // 스캔 후 변경사항 저장
    saveState(savedSettings, savedEntries);

    // 2. 각 편입 종목 상세 정보 계산 (병렬 배치)
    // 스캔 데이터에서 현재가 매핑 (KIS API 현재가 호출 제거 → 속도 대폭 개선)
    const scanPriceMap = new Map(scanStocks.map((s) => [s.code, s.close]));
    const BATCH = 10;
    const enrichedStocks: WatchlistStock[] = [];

    for (let i = 0; i < savedEntries.length; i += BATCH) {
      const batch = savedEntries.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async (entry) => {
          try {
            const scanPrice = scanPriceMap.get(entry.code);
            return await enrichEntry(entry, savedSettings, scanPrice);
          } catch {
            return {
              code: entry.code,
              name: entry.name,
              system: entry.system,
              entryDate: entry.entryDate,
              entryPrice: entry.entryPrice,
              currentPrice: scanPriceMap.get(entry.code) || entry.entryPrice,
              high20d: 0, low10d: 0, high55d: 0, low20d: 0,
              nValue: 0, unitSize: 0, unitAmount: 0,
              stopPrice: 0, riskPerShare: 0, positionPct: 0, rrr: 0,
              pnlPct: 0, tradingDays: 0,
              sellSignal: false,
              sellReason: undefined,
            } as WatchlistStock;
          }
        })
      );
      enrichedStocks.push(...results);
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

    // 편출 종목 정리 (auto_scheduler에서 장마감 후 호출)
    // sellSignal=true인 종목을 아카이브로 이동
    if (body.action === 'cleanupSellSignals') {
      const enrichedStocks: WatchlistStock[] = [];
      for (const entry of savedEntries) {
        try {
          const stock = await enrichEntry(entry, savedSettings);
          enrichedStocks.push(stock);
        } catch {
          enrichedStocks.push({
            code: entry.code, name: entry.name, system: entry.system,
            entryDate: entry.entryDate, entryPrice: entry.entryPrice,
            currentPrice: entry.entryPrice,
            high20d: 0, low10d: 0, high55d: 0, low20d: 0,
            nValue: 0, unitSize: 0, unitAmount: 0,
            stopPrice: 0, riskPerShare: 0, positionPct: 0, rrr: 0,
            pnlPct: 0, tradingDays: 0,
            sellSignal: false, sellReason: undefined,
          });
        }
        await new Promise((r) => setTimeout(r, 80));
      }

      const toArchive = enrichedStocks.filter((s) => s.sellSignal);
      const toKeep = enrichedStocks.filter((s) => !s.sellSignal);

      // 편출 종목을 아카이브로 이동
      for (const stock of toArchive) {
        // 이미 아카이브에 있으면 스킵
        if (!savedArchive.some((a) => a.code === stock.code)) {
          savedArchive.push({
            code: stock.code,
            name: stock.name,
            system: stock.system,
            entryDate: stock.entryDate,
            entryPrice: stock.entryPrice,
            archivedAt: today(),
            sellReason: stock.sellReason || '편출',
          });
        }
      }

      // 활성 목록에서 편출 종목 제거
      savedEntries = savedEntries.filter((e) =>
        toKeep.some((k) => k.code === e.code)
      );

      // 3주 지난 아카이브 정리
      savedArchive = cleanExpiredArchive(savedArchive);
      saveState(savedSettings, savedEntries, savedArchive);

      return NextResponse.json({
        success: true,
        archived: toArchive.map((s) => ({ code: s.code, name: s.name, reason: s.sellReason })),
        remaining: savedEntries.length,
        archiveTotal: savedArchive.length,
      });
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
