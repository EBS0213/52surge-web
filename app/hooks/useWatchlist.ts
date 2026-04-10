'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { WatchlistResult, TurtleSettings, TurtleSystem } from '../types/stock';

export function useWatchlist() {
  const [data, setData] = useState<WatchlistResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const fetchWatchlist = useCallback(async (showLoading = true, forceRefresh = false) => {
    if (showLoading) setLoading(true);
    setError(null);

    try {
      const url = forceRefresh ? '/api/watchlist?refresh=1' : '/api/watchlist';
      const res = await fetch(url);
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

  // 설정값을 클라이언트 로컬 state로 관리 (서버 저장 X → 각 접속자 독립, 창 닫으면 초기화)
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
