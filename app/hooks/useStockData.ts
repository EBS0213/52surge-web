'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { ScanResult } from '../types/stock';

const POLL_INTERVAL_MS = 60 * 1000; // 1분마다 자동 갱신

interface UseStockDataReturn {
  data: ScanResult | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

export function useStockData(maxResults = 20): UseStockDataReturn {
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const fetchData = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/stocks/scan?max_results=${maxResults}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result: ScanResult = await response.json();

      if (isMountedRef.current) {
        setData(result);
        setLastUpdated(new Date());
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다');
      }
    } finally {
      if (isMountedRef.current && !isBackground) {
        setLoading(false);
      }
    }
  }, [maxResults]);

  // 페이지 로드 시 자동 fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchData();

    // 주기적 자동 갱신
    intervalRef.current = setInterval(() => {
      fetchData(true); // background refresh (로딩 표시 안 함)
    }, POLL_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  // 탭 포커스 시 자동 갱신
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && data) {
        const timeSinceUpdate = lastUpdated
          ? Date.now() - lastUpdated.getTime()
          : Infinity;
        if (timeSinceUpdate > POLL_INTERVAL_MS) {
          fetchData(true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [data, lastUpdated, fetchData]);

  return { data, loading, error, lastUpdated, refresh: () => fetchData(false) };
}
