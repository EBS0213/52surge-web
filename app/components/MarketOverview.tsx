'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { ScanResult } from '../types/stock';

interface MarketOverviewProps {
  data: ScanResult;
}

interface MarketItem {
  name: string;
  price: string;
  change: string;
  changeRate: string;
  isUp: boolean;
}

interface GlobalData {
  exchange: MarketItem[];
  oil: MarketItem[];
}

function getRSIColor(rsi: number | null): string {
  if (rsi === null) return 'text-gray-400';
  if (rsi >= 70) return 'text-red-500';
  if (rsi <= 30) return 'text-blue-500';
  return 'text-gray-900';
}

function getRSILabel(rsi: number | null): string {
  if (rsi === null) return '';
  if (rsi >= 70) return '과매수';
  if (rsi <= 30) return '과매도';
  return '중립';
}

/** 컴팩트 세로 레이아웃 (지수 카드 옆에 배치용) */
export default function MarketOverview({ data }: MarketOverviewProps) {
  const [global, setGlobal] = useState<GlobalData | null>(null);
  const isMounted = useRef(true);

  const fetchGlobal = useCallback(async () => {
    try {
      const res = await fetch('/api/market/global');
      if (!res.ok) return;
      const result = await res.json();
      if (isMounted.current) setGlobal(result);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchGlobal();
    const interval = setInterval(fetchGlobal, 5 * 60 * 1000);
    return () => { isMounted.current = false; clearInterval(interval); };
  }, [fetchGlobal]);

  return (
    <div className="flex flex-col gap-2 min-w-0 h-full">
      {/* 거래일 */}
      <div className="bg-white rounded-xl p-3 border border-gray-100">
        <div className="text-[10px] text-gray-400 mb-0.5">거래일</div>
        <div className="text-sm font-semibold text-gray-900">{data.trading_date}</div>
      </div>

      {/* RSI */}
      <div className="bg-white rounded-xl p-3 border border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] text-gray-400">코스피 RSI</div>
            <div className={`text-sm font-semibold ${getRSIColor(data.market_rsi.kospi)}`}>
              {data.market_rsi.kospi?.toFixed(1) || 'N/A'}
              <span className="text-[10px] text-gray-400 ml-1">{getRSILabel(data.market_rsi.kospi)}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-400">코스닥 RSI</div>
            <div className={`text-sm font-semibold ${getRSIColor(data.market_rsi.kosdaq)}`}>
              {data.market_rsi.kosdaq?.toFixed(1) || 'N/A'}
              <span className="text-[10px] text-gray-400 ml-1">{getRSILabel(data.market_rsi.kosdaq)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 환율 */}
      <div className="bg-white rounded-xl p-3 border border-gray-100 flex-1">
        <div className="text-[10px] text-gray-400 mb-1.5">환율</div>
        {global?.exchange && global.exchange.length > 0 ? (
          <div className="space-y-1">
            {global.exchange.slice(0, 3).map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 truncate">{item.name}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-semibold text-gray-900">{item.price}</span>
                  {item.change && (
                    <span className={`text-[9px] ${item.isUp ? 'text-red-500' : 'text-blue-500'}`}>
                      {item.isUp ? '▲' : '▼'}{item.change}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-gray-300 animate-pulse">로딩...</div>
        )}
      </div>

      {/* 유가 */}
      <div className="bg-white rounded-xl p-3 border border-gray-100 flex-1">
        <div className="text-[10px] text-gray-400 mb-1.5">유가</div>
        {global?.oil && global.oil.length > 0 ? (
          <div className="space-y-1">
            {global.oil.slice(0, 3).map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 truncate">{item.name}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-semibold text-gray-900">{item.price}</span>
                  {item.change && (
                    <span className={`text-[9px] ${item.isUp ? 'text-red-500' : 'text-blue-500'}`}>
                      {item.isUp ? '▲' : '▼'}{item.change}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-gray-300 animate-pulse">로딩...</div>
        )}
      </div>
    </div>
  );
}
