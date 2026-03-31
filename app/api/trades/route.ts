/**
 * 트레이드 기록 (매매일지) API
 * GET  - 전체 기록 조회
 * POST - 기록 추가 / 벤치마크 설정 업데이트
 * DELETE ?id=xxx - 기록 삭제
 */

import { NextResponse, type NextRequest } from 'next/server';
import type {
  TradeRecord,
  BenchmarkConfig,
  TradeSummary,
  TradesResult,
  SellType,
} from '../../types/stock';

// ── 인메모리 스토어 ──
let savedTrades: TradeRecord[] = [];
let savedBenchmark: BenchmarkConfig = {
  indexName: '코스닥',
  startDate: '',
  endDate: '',
  initialSeed: 100_000_000,
};

// ID 생성
function generateId(): string {
  return `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 요약 통계 계산
function calculateSummary(trades: TradeRecord[]): TradeSummary {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winCount: 0,
      loseCount: 0,
      winRate: 0,
      totalPnl: 0,
      totalPnlPct: 0,
      currentSeed: savedBenchmark.initialSeed,
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
      savedBenchmark.initialSeed > 0
        ? (totalPnl / savedBenchmark.initialSeed) * 100
        : 0,
    currentSeed: lastTrade?.currentSeed ?? savedBenchmark.initialSeed,
    avgPnlPct: pnlPcts.length > 0 ? pnlPcts.reduce((a, b) => a + b, 0) / pnlPcts.length : 0,
    maxWinPct: pnlPcts.length > 0 ? Math.max(...pnlPcts) : 0,
    maxLossPct: pnlPcts.length > 0 ? Math.min(...pnlPcts) : 0,
  };
}

export async function GET() {
  const summary = calculateSummary(savedTrades);
  const result: TradesResult = {
    trades: savedTrades,
    benchmark: savedBenchmark,
    summary,
  };
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

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

      // 자동 계산
      const pnlAmount = (exitPrice - entryPrice) * quantity;
      const pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;

      // 현재시드: 이전 마지막 기록의 currentSeed + 이번 손익
      const prevSeed =
        savedTrades.length > 0
          ? savedTrades[savedTrades.length - 1].currentSeed
          : savedBenchmark.initialSeed;
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

      savedTrades.push(newTrade);
      return NextResponse.json({ success: true, trade: newTrade });
    }

    if (action === 'updateBenchmark') {
      const { benchmark } = body as { benchmark: Partial<BenchmarkConfig> };
      savedBenchmark = { ...savedBenchmark, ...benchmark };
      return NextResponse.json({ success: true, benchmark: savedBenchmark });
    }

    if (action === 'updateTrade') {
      const { id, trade: updates } = body as { id: string; trade: Partial<TradeRecord> };
      const idx = savedTrades.findIndex((t) => t.id === id);
      if (idx === -1) {
        return NextResponse.json({ error: '해당 기록을 찾을 수 없습니다' }, { status: 404 });
      }
      savedTrades[idx] = { ...savedTrades[idx], ...updates };
      return NextResponse.json({ success: true, trade: savedTrades[idx] });
    }

    return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: `요청 처리 실패: ${err instanceof Error ? err.message : ''}` },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id 파라미터가 필요합니다' }, { status: 400 });
  }

  const idx = savedTrades.findIndex((t) => t.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: '해당 기록을 찾을 수 없습니다' }, { status: 404 });
  }

  savedTrades.splice(idx, 1);

  // 삭제 후 currentSeed 재계산
  let runSeed = savedBenchmark.initialSeed;
  for (const trade of savedTrades) {
    runSeed += trade.pnlAmount;
    trade.currentSeed = runSeed;
  }

  return NextResponse.json({ success: true });
}
