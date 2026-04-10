#!/bin/bash
# Deploy watchlist updates to EC2
KEY="./52surge-key.pem"
HOST="ubuntu@3.37.194.236"
DIR="unimind-web"

echo "=== [1/4] Uploading route.ts (dedup S1/S2) ==="
ssh -i "$KEY" "$HOST" "cat > $DIR/app/api/watchlist/route.ts" << 'ENDROUTE'
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

const DATA_DIR = join(process.cwd(), '.data');
const WATCHLIST_FILE = join(DATA_DIR, 'watchlist.json');

interface PersistedState {
  settings: TurtleSettings;
  entries: WatchlistEntry[];
  archive: ArchivedEntry[];
}

const ARCHIVE_RETENTION_DAYS = 21;

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

function cleanExpiredArchive(archive: ArchivedEntry[]): ArchivedEntry[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ARCHIVE_RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return archive.filter((a) => a.archivedAt >= cutoffStr);
}

const initialState = loadState();
let savedSettings: TurtleSettings = initialState.settings;
let savedEntries: WatchlistEntry[] = initialState.entries;
let savedArchive: ArchivedEntry[] = initialState.archive;

const chartCache = new Map<string, { candles: ChartCandle[]; fetchedAt: number }>();
const CHART_CACHE_TTL = 1 * 60 * 1000;

let scanCache: { data: { stocks: Array<{ code: string; name: string; close: number }> }; fetchedAt: number } | null = null;
const SCAN_CACHE_TTL = 1 * 60 * 1000;

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

interface ScanStock {
  code: string;
  name: string;
  close: number;
  breakout_20d?: boolean;
  breakout_55d?: boolean;
  high_20d?: number;
  high_55d?: number;
}

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

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function enrichEntry(
  entry: WatchlistEntry,
  settings: TurtleSettings,
  scanPrice?: number
): Promise<WatchlistStock> {
  const candles = await getCachedChart(entry.code, 90);
  let currentPrice = scanPrice || entry.entryPrice;

  const nValue = calculateN(candles);
  const pos = calculatePosition(entry.entryPrice, currentPrice, settings);
  const tradingDays = countTradingDays(entry.entryDate, today());

  const high20d = candles.length >= 20 ? getHighN(candles.slice(-20), 20) : 0;
  const low10d = candles.length >= 10 ? getLowN(candles.slice(-10), 10) : 0;
  const high55d = candles.length >= 55 ? getHighN(candles.slice(-55), 55) : 0;
  const low20d = candles.length >= 20 ? getLowN(candles.slice(-20), 20) : 0;

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
    high20d, low10d, high55d, low20d,
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

// ── GET ──
export async function GET() {
  try {
    const scanStocks = await getScanStocks();
    const existingCodes = new Set(savedEntries.map((e) => e.code));

    savedArchive = cleanExpiredArchive(savedArchive);
    const archivedCodes = new Set(savedArchive.map((a) => a.code));

    const newStocks = scanStocks.filter((s) => !existingCodes.has(s.code));

    for (const stock of newStocks) {
      if (existingCodes.has(stock.code)) continue;

      // S2(55일) 우선, 아니면 S1(20일). 같은 종목은 하나의 시스템만 편입
      let addedSystem: 'system1' | 'system2' | null = null;
      if (stock.breakout_55d) {
        addedSystem = 'system2';
      } else if (stock.breakout_20d) {
        addedSystem = 'system1';
      }

      if (addedSystem) {
        savedEntries.push({
          code: stock.code,
          name: stock.name,
          system: addedSystem,
          entryDate: today(),
          entryPrice: stock.close,
        });
        if (archivedCodes.has(stock.code)) {
          savedArchive = savedArchive.filter((a) => a.code !== stock.code);
          archivedCodes.delete(stock.code);
        }
        existingCodes.add(stock.code);
      }
    }

    // 기존 중복 정리: 같은 code가 S1+S2 둘 다 있으면 S2만 남김
    const deduped: WatchlistEntry[] = [];
    const seen = new Set<string>();
    const sorted = [...savedEntries].sort((a, b) =>
      a.system === 'system2' && b.system !== 'system2' ? -1 :
      b.system === 'system2' && a.system !== 'system2' ? 1 : 0
    );
    for (const entry of sorted) {
      if (!seen.has(entry.code)) {
        seen.add(entry.code);
        deduped.push(entry);
      }
    }
    savedEntries = deduped;

    saveState(savedSettings, savedEntries);

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
              code: entry.code, name: entry.name, system: entry.system,
              entryDate: entry.entryDate, entryPrice: entry.entryPrice,
              currentPrice: scanPriceMap.get(entry.code) || entry.entryPrice,
              high20d: 0, low10d: 0, high55d: 0, low20d: 0,
              nValue: 0, unitSize: 0, unitAmount: 0,
              stopPrice: 0, riskPerShare: 0, positionPct: 0, rrr: 0,
              pnlPct: 0, tradingDays: 0,
              sellSignal: false, sellReason: undefined,
            } as WatchlistStock;
          }
        })
      );
      enrichedStocks.push(...results);
    }

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

// ── POST ──
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === 'updateSettings' && body.settings) {
      savedSettings = { ...savedSettings, ...body.settings };
      saveState(savedSettings, savedEntries);
      return NextResponse.json({ success: true, settings: savedSettings });
    }

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

      for (const stock of toArchive) {
        if (!savedArchive.some((a) => a.code === stock.code)) {
          savedArchive.push({
            code: stock.code, name: stock.name, system: stock.system,
            entryDate: stock.entryDate, entryPrice: stock.entryPrice,
            archivedAt: today(),
            sellReason: stock.sellReason || '편출',
          });
        }
      }

      savedEntries = savedEntries.filter((e) =>
        toKeep.some((k) => k.code === e.code)
      );

      savedArchive = cleanExpiredArchive(savedArchive);
      saveState(savedSettings, savedEntries, savedArchive);

      return NextResponse.json({
        success: true,
        archived: toArchive.map((s) => ({ code: s.code, name: s.name, reason: s.sellReason })),
        remaining: savedEntries.length,
        archiveTotal: savedArchive.length,
      });
    }

    if (body.action === 'addStock' && body.entry) {
      const entry: WatchlistEntry = {
        code: body.entry.code,
        name: body.entry.name,
        system: body.entry.system || 'system1',
        entryDate: body.entry.entryDate || today(),
        entryPrice: body.entry.entryPrice,
      };

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

// ── DELETE ──
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
ENDROUTE

echo "=== [2/4] Patching page.tsx (remove S1+S2 badge + scroll box) ==="
ssh -i "$KEY" "$HOST" "cd $DIR && python3 -c \"
import re

with open('app/watchlist/page.tsx', 'r') as f:
    code = f.read()

# 1. Remove dualSystem badge block from StockRow
# Remove the S1+S2 badge JSX (the {dualSystem && ...} block)
code = re.sub(
    r'\\s*\\{dualSystem && \\([\\s\\S]*?S1\\+S2[\\s\\S]*?\\)\\}',
    '',
    code
)

# 2. Remove dualSystem prop from StockRow component signature
code = code.replace('  dualSystem,\\n', '')
code = code.replace('  dualSystem: boolean;\\n', '')

# 3. Remove dualSystem calculation and prop passing in WatchlistTable
code = re.sub(
    r'\\s*const dualSystem = stocks\\.some\\([\\s\\S]*?\\);',
    '',
    code
)
code = re.sub(r'\\s*dualSystem=\\{dualSystem\\}', '', code)

# 4. Add scroll container: replace overflow-x-auto with max-h + overflow-auto
code = code.replace(
    'className=\\\"overflow-x-auto rounded-xl border border-gray-100\\\"',
    'className=\\\"rounded-xl border border-gray-100 max-h-[900px] overflow-auto\\\"'
)

with open('app/watchlist/page.tsx', 'w') as f:
    f.write(code)

print('page.tsx patched successfully')
\""

echo "=== [3/4] Building & restarting ==="
ssh -i "$KEY" "$HOST" "cd $DIR && npm run build && pm2 restart unimind-web"

echo "=== [4/4] Triggering cleanup (편출 처리) ==="
sleep 3
ssh -i "$KEY" "$HOST" "curl -s -X POST http://localhost:3000/api/watchlist -H 'Content-Type: application/json' -d '{\"action\":\"cleanupSellSignals\"}'"

echo ""
echo "=== ALL DONE ==="
