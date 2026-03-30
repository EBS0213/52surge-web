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

  const updateSettings = useCallback(async (settings: Partial<TurtleSettings>) => {
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateSettings', settings }),
      });
      if (!res.ok) throw new Error('설정 업데이트 실패');
      // 설정 변경 후 데이터 새로고침
      await fetchWatchlist(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '설정 업데이트 실패');
    }
  }, [fetchWatchlist]);

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

    // 120초마다 자동 새로고침
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
