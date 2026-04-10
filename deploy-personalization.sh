#!/bin/bash
# Deploy personalization updates:
# 1. Dennis settings → client-only (per-session, no server persist)
# 2. Ledger "새 기록" → login required
# Usage: bash deploy-personalization.sh

KEY="./52surge-key.pem"
HOST="ubuntu@3.37.194.236"
REMOTE="unimind-web"

echo "=== [1/3] Patch useWatchlist.ts (client-only settings) ==="
ssh -i "$KEY" "$HOST" "cat > $REMOTE/app/hooks/useWatchlist.ts" << 'HOOKEOF'
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WatchlistResult, TurtleSettings, TurtleSystem } from '../types/stock';

export function useWatchlist() {
  const [data, setData] = useState<WatchlistResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const fetchWatchlist = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/watchlist');
      if (!res.ok) throw new Error(`API 오류: ${res.status}`);
      const result: WatchlistResult = await res.json();
      if (isMountedRef.current) {
        setData(result);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : '알 수 없는 오류');
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  // 설정값을 클라이언트 로컬 state로 관리 (서버 저장 X -> 각 접속자 독립, 창 닫으면 초기화)
  const updateSettings = useCallback((settings: Partial<TurtleSettings>) => {
    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, settings: { ...prev.settings, ...settings } };
    });
  }, []);

  const addStock = useCallback(async (
    code: string,
    name: string,
    entryPrice: number,
    system: TurtleSystem = 'system1'
  ) => {
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addStock',
          entry: { code, name, entryPrice, system },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '종목 추가 실패');
      }
      await fetchWatchlist(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '종목 추가 실패');
      throw err;
    }
  }, [fetchWatchlist]);

  const removeStock = useCallback(async (code: string) => {
    try {
      const res = await fetch(`/api/watchlist?code=${code}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('종목 편출 실패');
      await fetchWatchlist(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '종목 편출 실패');
    }
  }, [fetchWatchlist]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchWatchlist();

    const interval = setInterval(() => fetchWatchlist(false), 120_000);

    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchWatchlist]);

  return {
    data,
    loading,
    error,
    refresh: fetchWatchlist,
    updateSettings,
    addStock,
    removeStock,
  };
}
HOOKEOF

echo ""
echo "=== [2/3] Patch watchlist/page.tsx (SettingsPanel - client-only, no async) ==="
ssh -i "$KEY" "$HOST" "cd $REMOTE && python3 -c \"
content = open('app/watchlist/page.tsx','r').read()

# 1. Fix onUpdate type signature
content = content.replace(
    'onUpdate: (s: Partial<TurtleSettings>) => void | Promise<void>;',
    'onUpdate: (s: Partial<TurtleSettings>) => void;'
)

# 2. Replace async handleSave with sync version
content = content.replace(
    '''  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(form);
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };''',
    '''  const handleSave = () => {
    onUpdate(form);
    setOpen(false);
  };'''
)

# 3. Remove saving state
content = content.replace(
    'const [saving, setSaving] = useState(false);',
    ''
)

# 4. Fix save button
content = content.replace(
    '''<button onClick={handleSave} disabled={saving} className=\"bg-black text-white px-6 py-2 rounded-lg text-sm hover:bg-gray-800 transition-colors disabled:opacity-50\">
          {saving ? '저장 중...' : '저장'}
        </button>''',
    '''<button onClick={handleSave} className=\"bg-black text-white px-6 py-2 rounded-lg text-sm hover:bg-gray-800 transition-colors\">
          적용
        </button>'''
)

open('app/watchlist/page.tsx','w').write(content)
print('watchlist page patched')
\""

echo ""
echo "=== [3/3] Patch trades/page.tsx (login gate for new records) ==="
ssh -i "$KEY" "$HOST" "cd $REMOTE && python3 -c \"
content = open('app/trades/page.tsx','r').read()

# 1. Add useEffect, useCallback to imports
content = content.replace(
    \\\"import { useState } from 'react';\\\",
    \\\"import { useState, useEffect, useCallback } from 'react';\\\"
)

# 2. Add auth check state after deleteConfirm
old_block = '''const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);'''
new_block = '''const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const d = await res.json();
      setIsLoggedIn(!!d.user);
    } catch { setIsLoggedIn(false); }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);'''
content = content.replace(old_block, new_block)

# 3. Replace new record button with auth-gated version
old_btn = '''<button
              onClick={() => setShowForm(!showForm)}
              className=\\\"px-5 py-2.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-800 transition-colors\\\"
            >
              + 새 기록
            </button>'''
new_btn = '''{isLoggedIn ? (
              <button
                onClick={() => setShowForm(!showForm)}
                className=\\\"px-5 py-2.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-800 transition-colors\\\"
              >
                + 새 기록
              </button>
            ) : (
              <button
                onClick={() => { alert('기록을 추가하려면 로그인이 필요합니다.'); window.location.href = '/'; }}
                className=\\\"px-5 py-2.5 bg-gray-300 text-gray-600 text-sm rounded-xl hover:bg-gray-400 transition-colors\\\"
              >
                로그인 후 기록 추가
              </button>
            )}'''
content = content.replace(old_btn, new_btn)

# 4. Gate the empty state link
old_empty = '''<button onClick={() => setShowForm(true)} className=\\\"text-gray-600 underline mt-2 inline-block\\\">
                      첫 거래를 기록해보세요
                    </button>'''
new_empty = '''{isLoggedIn && (
                      <button onClick={() => setShowForm(true)} className=\\\"text-gray-600 underline mt-2 inline-block\\\">
                        첫 거래를 기록해보세요
                      </button>
                    )}'''
content = content.replace(old_empty, new_empty)

open('app/trades/page.tsx','w').write(content)
print('trades page patched')
\""

echo ""
echo "=== [4/7] Create login page ==="
ssh -i "$KEY" "$HOST" "mkdir -p $REMOTE/app/login"
ssh -i "$KEY" "$HOST" "cat > $REMOTE/app/login/page.tsx" << 'LOGINEOF'
'use client';

import Link from 'next/link';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-black tracking-tight text-black">OURTLE</h1>
        <p className="text-xs text-gray-400 tracking-[0.3em] mt-1.5 uppercase">Turtle Rules Everything Around Me</p>
      </div>

      <div className="w-full max-w-[400px]">
        <div className="space-y-3">
          <a href="/api/auth/google" className="flex items-center w-full px-6 py-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" className="flex-shrink-0"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            <span className="flex-1 text-center text-sm font-medium text-gray-800">Google로 로그인</span>
          </a>

          <a href="/api/auth/kakao" className="flex items-center w-full px-6 py-4 rounded-lg transition-colors hover:opacity-90" style={{ backgroundColor: '#FEE500' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" className="flex-shrink-0"><path fill="#191919" d="M12 3C6.48 3 2 6.36 2 10.44c0 2.62 1.75 4.93 4.38 6.24l-1.12 4.12c-.1.36.3.65.62.45l4.8-3.18c.43.04.87.07 1.32.07 5.52 0 10-3.36 10-7.7S17.52 3 12 3z"/></svg>
            <span className="flex-1 text-center text-sm font-medium" style={{ color: '#191919' }}>카카오로 로그인</span>
          </a>
        </div>

        <div className="flex items-center my-8">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="px-4 text-xs text-gray-400">또는</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <p className="text-center text-xs text-gray-400 leading-relaxed">
          로그인하면 매매일지(Ledger)를 개인 계정에<br />
          저장하고 관리할 수 있습니다.
        </p>

        <div className="mt-8 text-center">
          <Link href="/" className="text-sm text-gray-500 hover:text-black transition-colors">
            ← 홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
LOGINEOF

echo ""
echo "=== [5/7] Upload updated AuthButton (link to /login instead of dropdown) ==="
ssh -i "$KEY" "$HOST" "cat > $REMOTE/app/components/AuthButton.tsx" << 'AUTHBTN2'
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

interface User {
  userId: string;
  name: string;
  email: string;
  picture?: string;
  provider: 'google' | 'kakao';
}

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      setUser(data.user || null);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setShowMenu(false);
    window.location.reload();
  };

  if (!user) {
    return (
      <Link href="/login" className="text-xs text-[#86868b] hover:text-white transition-colors px-2 py-1 rounded">
        로그인
      </Link>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button onClick={() => setShowMenu(!showMenu)} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
        {user.picture ? (
          <img src={user.picture} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-[#86868b] flex items-center justify-center text-[9px] text-white font-medium">
            {user.name?.[0] || '?'}
          </div>
        )}
        <span className="text-xs text-white/80 hidden sm:inline">{user.name}</span>
      </button>
      {showMenu && (
        <div className="absolute right-0 top-8 bg-[#2d2d2f] rounded-xl shadow-2xl border border-white/10 p-2 w-44 z-50">
          <div className="px-2 py-1.5 border-b border-white/5 mb-1">
            <p className="text-[11px] text-white font-medium truncate">{user.name}</p>
            <p className="text-[9px] text-[#86868b] truncate">{user.email}</p>
          </div>
          <button onClick={handleLogout} className="w-full text-left px-2 py-1.5 text-xs text-[#86868b] hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
AUTHBTN2

echo ""
echo "=== [6/7] Patch trades page (login button -> /login link) ==="
ssh -i "$KEY" "$HOST" "cd $REMOTE && python3 -c \"
content = open('app/trades/page.tsx','r').read()
# Change alert-based button to /login link
old = '''onClick={() => { alert(\\\"기록을 추가하려면 로그인이 필요합니다.\\\"); window.location.href = \\\"/\\\"; }}'''
if old in content:
    content = content.replace(old, '')
open('app/trades/page.tsx','w').write(content)
print('trades login button patched')
\"" 2>/dev/null || echo "(skipped - already patched)"

echo ""
echo "=== [7/7] Upload trades/route.ts (per-user file storage) ==="
ssh -i "$KEY" "$HOST" "cat > $REMOTE/app/api/trades/route.ts" << 'TRADESEOF'
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

function generateId(): string {
  return `tr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function calculateSummary(trades: TradeRecord[], benchmark: BenchmarkConfig): TradeSummary {
  if (trades.length === 0) {
    return {
      totalTrades: 0, winCount: 0, loseCount: 0, winRate: 0,
      totalPnl: 0, totalPnlPct: 0, currentSeed: benchmark.initialSeed,
      avgPnlPct: 0, maxWinPct: 0, maxLossPct: 0,
    };
  }
  const winTrades = trades.filter((t) => t.pnlAmount > 0);
  const totalPnl = trades.reduce((sum, t) => sum + t.pnlAmount, 0);
  const pnlPcts = trades.map((t) => t.pnlPct);
  const lastTrade = trades[trades.length - 1];
  return {
    totalTrades: trades.length,
    winCount: winTrades.length,
    loseCount: trades.length - winTrades.length,
    winRate: trades.length > 0 ? (winTrades.length / trades.length) * 100 : 0,
    totalPnl,
    totalPnlPct: benchmark.initialSeed > 0 ? (totalPnl / benchmark.initialSeed) * 100 : 0,
    currentSeed: lastTrade?.currentSeed ?? benchmark.initialSeed,
    avgPnlPct: pnlPcts.length > 0 ? pnlPcts.reduce((a, b) => a + b, 0) / pnlPcts.length : 0,
    maxWinPct: pnlPcts.length > 0 ? Math.max(...pnlPcts) : 0,
    maxLossPct: pnlPcts.length > 0 ? Math.min(...pnlPcts) : 0,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    const result: TradesResult = {
      trades: [], benchmark: { ...DEFAULT_BENCHMARK },
      summary: calculateSummary([], DEFAULT_BENCHMARK),
    };
    return NextResponse.json(result);
  }
  const userData = await loadUserTrades(session.userId);
  const summary = calculateSummary(userData.trades, userData.benchmark);
  return NextResponse.json({ trades: userData.trades, benchmark: userData.benchmark, summary });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  try {
    const body = await request.json();
    const { action } = body;
    const userData = await loadUserTrades(session.userId);

    if (action === 'addTrade') {
      const { stockName, stockCode, source, entryDate, exitDate, entryPrice, exitPrice,
              quantity, investAmount, sellType, sellReason, units, memo } = body.trade as {
        stockName: string; stockCode: string; source: string;
        entryDate: string; exitDate: string; entryPrice: number; exitPrice: number;
        quantity: number; investAmount: number; sellType: SellType;
        sellReason?: string; units: number; memo?: string;
      };
      const pnlAmount = (exitPrice - entryPrice) * quantity;
      const pnlPct = entryPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
      const prevSeed = userData.trades.length > 0
        ? userData.trades[userData.trades.length - 1].currentSeed
        : userData.benchmark.initialSeed;
      const currentSeed = prevSeed + pnlAmount;
      const newTrade: TradeRecord = {
        id: generateId(), stockName, stockCode: stockCode || '', source: source || 'Dennis',
        entryDate, exitDate, entryPrice, exitPrice, quantity,
        investAmount: investAmount || entryPrice * quantity,
        pnlAmount, pnlPct, sellType, sellReason, units: units || 1,
        currentSeed, memo, createdAt: new Date().toISOString(),
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
      if (idx === -1) return NextResponse.json({ error: '해당 기록을 찾을 수 없습니다' }, { status: 404 });
      userData.trades[idx] = { ...userData.trades[idx], ...updates };
      await saveUserTrades(session.userId, userData);
      return NextResponse.json({ success: true, trade: userData.trades[idx] });
    }

    return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: `요청 처리 실패: ${err instanceof Error ? err.message : ''}` }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 파라미터가 필요합니다' }, { status: 400 });

  const userData = await loadUserTrades(session.userId);
  const idx = userData.trades.findIndex((t) => t.id === id);
  if (idx === -1) return NextResponse.json({ error: '해당 기록을 찾을 수 없습니다' }, { status: 404 });

  userData.trades.splice(idx, 1);
  let runSeed = userData.benchmark.initialSeed;
  for (const trade of userData.trades) {
    runSeed += trade.pnlAmount;
    trade.currentSeed = runSeed;
  }
  await saveUserTrades(session.userId, userData);
  return NextResponse.json({ success: true });
}
TRADESEOF

echo ""
echo "=== Building... ==="
ssh -i "$KEY" "$HOST" "cd $REMOTE && npm run build && pm2 restart unimind-web"
echo "=== Done! ==="
