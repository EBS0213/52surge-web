/**
 * 텔레그램 워치리스트 알림 API
 * GET /api/telegram/watchlist — 워치리스트 변동 시에만 발송
 *
 * - 신규 편입 종목 발생 → 알림
 * - 매도 시그널 발생 → 알림
 * - 변동 없으면 발송하지 않음
 *
 * EC2 cron: every 10 min — curl -s http://localhost:3000/api/telegram/watchlist
 */

import { NextResponse } from 'next/server';
import { sendWatchlistMessage, isWatchlistConfigured, escapeHtml } from '../../../lib/telegram';

interface WatchlistStock {
  code: string;
  name: string;
  system: string;
  entryDate: string;
  entryPrice: number;
  currentPrice: number;
  nValue: number;
  unitSize: number;
  unitAmount: number;
  stopPrice: number;
  positionPct: number;
  rrr: number;
  pnlPct: number;
  tradingDays: number;
  sellSignal: boolean;
  sellReason: string;
}

// 이전 상태 (변동 감지용)
let previousCodes: Set<string> = new Set();
let previousSellSignals: Set<string> = new Set();
let initialized = false;

/** 숫자 포맷 */
function formatNum(n: number): string {
  return n.toLocaleString('ko-KR');
}

/** 퍼센트 포맷 */
function formatPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

/** KST 타임스탬프 */
function kstTimeStr(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  const min = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${y}.${m}.${d} ${h}:${min}`;
}

/** 신규 편입 메시지 */
function formatNewEntries(stocks: WatchlistStock[]): string {
  const lines: string[] = [];
  lines.push(`<b>🟢 워치리스트 신규 편입</b>`);
  lines.push(`<i>${kstTimeStr()}</i>`);
  lines.push('');

  for (const s of stocks) {
    const pnlIcon = s.pnlPct >= 0 ? '📈' : '📉';
    lines.push(`<b>${escapeHtml(s.name)}</b> (${s.code})`);
    lines.push(`  시스템: ${s.system} | 편입가: ${formatNum(s.entryPrice)}원`);
    lines.push(`  현재가: ${formatNum(s.currentPrice)}원 ${pnlIcon} ${formatPct(s.pnlPct)}`);
    lines.push(`  N값: ${formatNum(Math.round(s.nValue))} | 유닛: ${formatNum(s.unitSize)}주`);
    lines.push(`  손절가: ${formatNum(s.stopPrice)}원`);
    lines.push('');
  }

  lines.push('— <i>OURTLE 52surge.com</i>');
  return lines.join('\n');
}

/** 매도 시그널 메시지 */
function formatSellSignals(stocks: WatchlistStock[]): string {
  const lines: string[] = [];
  lines.push(`<b>🔴 매도 시그널 발생</b>`);
  lines.push(`<i>${kstTimeStr()}</i>`);
  lines.push('');

  for (const s of stocks) {
    lines.push(`<b>${escapeHtml(s.name)}</b> (${s.code})`);
    lines.push(`  사유: ${escapeHtml(s.sellReason)}`);
    lines.push(`  편입가: ${formatNum(s.entryPrice)}원 → 현재가: ${formatNum(s.currentPrice)}원 (${formatPct(s.pnlPct)})`);
    lines.push(`  보유일: ${s.tradingDays}일`);
    lines.push('');
  }

  lines.push('— <i>OURTLE 52surge.com</i>');
  return lines.join('\n');
}

export async function GET() {
  if (!isWatchlistConfigured()) {
    return NextResponse.json(
      { error: 'Telegram watchlist bot not configured. Set TELEGRAM_WATCHLIST_BOT_TOKEN and TELEGRAM_WATCHLIST_CHAT_ID.' },
      { status: 503 }
    );
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/watchlist`, {
      signal: AbortSignal.timeout(60000),
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Watchlist API failed: ${res.status}`);
    }

    const data = await res.json();
    const stocks: WatchlistStock[] = data.stocks || [];

    const currentCodes = new Set(stocks.map(s => s.code));
    const currentSellSignals = new Set(
      stocks.filter(s => s.sellSignal).map(s => s.code)
    );

    // 첫 실행: 상태만 저장하고 발송하지 않음 (기준점 설정)
    if (!initialized) {
      previousCodes = currentCodes;
      previousSellSignals = currentSellSignals;
      initialized = true;
      return NextResponse.json({
        sent: false,
        reason: 'Initialized — baseline set, will notify on next change',
        totalStocks: stocks.length,
      });
    }

    const results: { type: string; ok: boolean; error?: string }[] = [];

    // 1. 신규 편입 감지
    const newEntries = stocks.filter(
      s => !s.sellSignal && !previousCodes.has(s.code)
    );
    if (newEntries.length > 0) {
      const msg = formatNewEntries(newEntries);
      const result = await sendWatchlistMessage(msg);
      results.push({ type: 'new_entries', ok: result.ok, error: result.description });
      await new Promise(r => setTimeout(r, 1000));
    }

    // 2. 신규 매도 시그널 감지
    const newSellSignals = stocks.filter(
      s => s.sellSignal && !previousSellSignals.has(s.code)
    );
    if (newSellSignals.length > 0) {
      const msg = formatSellSignals(newSellSignals);
      const result = await sendWatchlistMessage(msg);
      results.push({ type: 'sell_signals', ok: result.ok, error: result.description });
    }

    // 상태 갱신
    previousCodes = currentCodes;
    previousSellSignals = currentSellSignals;

    if (results.length === 0) {
      return NextResponse.json({
        sent: false,
        reason: 'No changes detected',
        totalStocks: stocks.length,
      });
    }

    return NextResponse.json({
      sent: true,
      newEntries: newEntries.length,
      newSellSignals: newSellSignals.length,
      totalStocks: stocks.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `워치리스트 알림 실패: ${error instanceof Error ? error.message : ''}` },
      { status: 500 }
    );
  }
}
