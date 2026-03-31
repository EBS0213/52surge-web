'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TradesResult, BenchmarkConfig, SellType } from '../types/stock';

interface AddTradeInput {
  stockName: string;
  stockCode?: string;
  source?: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  investAmount?: number;
  sellType: SellType;
  sellReason?: string;
  units?: number;
  memo?: string;
}

export function useTrades() {
  const [data, setData] = useState<TradesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const fetchTrades = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/trades');
      if (!res.ok) throw new Error(`API 오류: ${res.status}`);
      const result: TradesResult = await res.json();
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

  const addTrade = useCallback(async (trade: AddTradeInput) => {
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addTrade', trade }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || '기록 추가 실패');
      }
      await fetchTrades(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '기록 추가 실패');
      throw err;
    }
  }, [fetchTrades]);

  const removeTrade = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/trades?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('기록 삭제 실패');
      await fetchTrades(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '기록 삭제 실패');
    }
  }, [fetchTrades]);

  const updateBenchmark = useCallback(async (benchmark: Partial<BenchmarkConfig>) => {
    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateBenchmark', benchmark }),
      });
      if (!res.ok) throw new Error('벤치마크 업데이트 실패');
      await fetchTrades(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '벤치마크 업데이트 실패');
    }
  }, [fetchTrades]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchTrades();
    return () => { isMountedRef.current = false; };
  }, [fetchTrades]);

  return {
    data,
    loading,
    error,
    refresh: fetchTrades,
    addTrade,
    removeTrade,
    updateBenchmark,
  };
}
