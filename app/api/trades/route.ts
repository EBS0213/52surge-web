/**
 * 트레이드 기록 (매매일지) API — 유저별 파일 저장
 * GET  - 전체 기록 조회 (로그인 시 유저별, 미로그인 시 빈 목록)
 * POST - 기록 추가 / 벤치마크 설정 업데이트 (로그인 필수)
 * DELETE ?id=xxx - 기록 삭제 (로그인 필수)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getSession } from '../../lib/auth';
import type {
  TradeRecord,
  BenchmarkConfig,
  TradeSummary,
  TradesResult,
  SellType,
} from '../../types/stock';

const DATA_DIR = path.join(process.cwd(), '.data', 'users');

// ── 유저별 파일 I/O ──

function userDir(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, safe);
}

async function ensureDir(dirPath: string): Promise<void> {
  try { await mkdir(dirPath, { recursive: true }); } catch { /* exists */ }
}

interface UserTradesData {
  trades: TradeRecord[];
  benchmark: BenchmarkConfig;
}

const DEFAULT_BENCHMARK: BenchmarkConfig = {
  indexName: '코스닥',
  startDate: '',
  endDate: '',
  initialSeed: 100_000_000,
};

async function loadUserTrades(userId: string): Promise<UserTradesData> {
  try {
    const filePath = path.join(userDir(userId), 'trades.json');
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as UserTradesData;
  } catch {
    return { trades: [], benchmark: { ...DEFAULT_BENCHMARK } };
  }
}

async function saveUserTrades(userId: string, data: UserTradesData): Promise<void> {
  const dir = userDir(userId);
  await ensureDir(dir);
  await writeFile(path.join(dir, 'trades.json'), JSON.stringify(data, null, 2), 'utf-8');
}

// ── 유틸 ──

function generateId(): string {
  return `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function calculateSummary(trades: TradeRecord[], benchmark: BenchmarkConfig): TradeSummary {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winCount: 0,
      loseCount: 0,
      winRate: 0,
      totalPnl: 0,
      totalPnlPct: 0,
      currentSeed: benchmark.initialSeed,
      avgPnlPct: 0,
      maxWinPct: 0,
      maxLossPct: 0,
    };
  }

  const winTrades = trades.filter((t) => t.pnlAmount > 0);
  const loseTrades = trades.filter((t) => t.pnlAmount <= 0);
  const totalPnl = trades.reduce((sum, t) => sum + t.pnlAmount, 0);
  const pnlPcts = trades.map((t) => t.pnlPct);
  const lastTrade = trades[trades.length - 1];

  return {
    totalTrades: trades.length,
    winCount: winTrades.length,
    loseCount: loseTrades.length,
    winRate: trades.length > 0 ? (winTrades.length / trades.length) * 100 : 0,
    totalPnl,
    totalPnlPct:
      benchmark.initialSeed > 0
        ? (totalPnl / benchmark.initialSeed) * 100
        : 0,
    currentSeed: lastTrade?.currentSeed ?? benchmark.initialSeed,
    avgPnlPct: pnlPcts.length > 0 ? pnlPcts.reduce((a, b) => a + b, 0) / pnlPcts.length : 0,
    maxWinPct: pnlPcts.length > 0 ? Math.max(...pnlPcts) : 0,
    maxLossPct: pnlPcts.length > 0 ? Math.min(...pnlPcts) : 0,
  };
}

// ── GET ──

export async function GET() {
  const session = await getSession();

  if (!session) {
    // 비로그인: 빈 결과
    const result: TradesResult = {
      trades: [],
      benchmark: { ...DEFAULT_BENCHMARK },
      summary: calculateSummary([], DEFAULT_BENCHMARK),
    };
    return NextResponse.json(result);
  }

  const userData = await loadUserTrades(session.userId);
  const summary = calculateSummary(userData.trades, userData.benchmark);
  const result: TradesResult = {
    trades: userData.trades,
    benchmark: userData.benchmark,
    summary,
  };
  return NextResponse.json(result);
}

// ── POST ──

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;
    const userData = await loadUserTrades(session.userId);

    if (action === 'addTrade') {
      const {
        stockName,
        stockCode,
        source,
        entryDate,
        exitDate,
        entryPrice,
        exitPrice,
        quantity,
        investAmount,
        sellType,
        sellReason,
        units,
        memo,
      } = body.trade as {
        stockName: string;
        stockCode: string;
        source: string;
        entryDate: string;
        exitDate: string;
        entryPrice: number;
        exitPrice: number;
        quantity: number;
        investAmount: number;
        sellType: SellType;
        sellReason?: string;
        units: number;
        memo?: string;
      };

      const pnlAmount = (exitPrice - entryPrice) * quantity;
      const pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;

      const prevSeed =
        userData.trades.length > 0
          ? userData.trades[userData.trades.length - 1].currentSeed
          : userData.benchmark.initialSeed;
      const currentSeed = prevSeed + pnlAmount;

      const newTrade: TradeRecord = {
        id: generateId(),
        stockName,
        stockCode: stockCode || '',
        source: source || 'Dennis',
        entryDate,
        exitDate,
        entryPrice,
        exitPrice,
        quantity,
        investAmount: investAmount || entryPrice * quantity,
        pnlAmount,
        pnlPct,
        sellType,
        sellReason,
        units: units || 1,
        currentSeed,
        memo,
        createdAt: new Date().toISOString(),
      };

      userData.trades.push(newTrade);
      await saveUserTrades(session.userId, userData);
      return NextResponse.json({ success: true, trade: newTrade });
    }

    if (action === 'updateBenchmark') {
      const { benchmark } = body as { benchmark: Partial<BenchmarkConfig> };
      userData.benchmark = { ...userData.benchmark, ...benchmark };
      await saveUserTrades(session.userId, userData);
      return NextResponse.json({ success: true, benchmark: userData.benchmark });
    }

    if (action === 'updateTrade') {
      const { id, trade: updates } = body as { id: string; trade: Partial<TradeRecord> };
      const idx = userData.trades.findIndex((t) => t.id === id);
      if (idx === -1) {
        return NextResponse.json({ error: '해당 기록을 찾을 수 없습니다' }, { status: 404 });
      }
      userData.trades[idx] = { ...userData.trades[idx], ...updates };
      await saveUserTrades(session.userId, userData);
      return NextResponse.json({ success: true, trade: userData.trades[idx] });
    }

    return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: `요청 처리 실패: ${err instanceof Error ? err.message : ''}` },
      { status: 500 }
    );
  }
}

// ── DELETE ──

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id 파라미터가 필요합니다' }, { status: 400 });
  }

  const userData = await loadUserTrades(session.userId);
  const idx = userData.trades.findIndex((t) => t.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: '해당 기록을 찾을 수 없습니다' }, { status: 404 });
  }

  userData.trades.splice(idx, 1);

  // 삭제 후 currentSeed 재계산
  let runSeed = userData.benchmark.initialSeed;
  for (const trade of userData.trades) {
    runSeed += trade.pnlAmount;
    trade.currentSeed = runSeed;
  }

  await saveUserTrades(session.userId, userData);
  return NextResponse.json({ success: true });
}
