'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface RealtimePrice {
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  high: number;
  low: number;
  open: number;
}

const POLL_INTERVAL = 10_000; // 10초마다 갱신

export function useRealtimePrice(stockCodes: string[]) {
  const [prices, setPrices] = useState<Record<string, RealtimePrice>>({});
  const [isAvailable, setIsAvailable] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPrices = useCallback(async () => {
    if (stockCodes.length === 0) return;

    try {
      const codes = stockCodes.slice(0, 10).join(',');
      const res = await fetch(`/api/kis/realtime?codes=${codes}`);

      if (res.status === 503) {
        // KIS API 미설정
        setIsAvailable(false);
        return;
      }

      if (!res.ok) return;

      const data = await res.json();
      if (data.error) {
        setIsAvailable(false);
        return;
      }

      setPrices(data);
      setIsAvailable(true);
    } catch {
      // 네트워크 오류 시 조용히 무시 (다음 폴링에서 재시도)
    }
  }, [stockCodes]);

  useEffect(() => {
    fetchPrices();

    intervalRef.current = setInterval(fetchPrices, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchPrices]);

  return { prices, isAvailable };
}
