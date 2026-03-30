'use client';

import { useState } from 'react';
import type { Stock, ScanResult } from '../types/stock';
import StockCard from './StockCard';

interface RealtimePrice {
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  high: number;
  low: number;
  open: number;
}

interface StockGridProps {
  data: ScanResult;
  realtimePrices?: Record<string, RealtimePrice>;
  isRealtimeAvailable?: boolean;
  onStockClick?: (stock: Stock) => void;
}

const PAGE_SIZE = 12;

export default function StockGrid({
  data,
  realtimePrices = {},
  isRealtimeAvailable = false,
  onStockClick,
}: StockGridProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const visibleStocks = data.stocks.slice(0, visibleCount);
  const hasMore = visibleCount < data.stocks.length;

  return (
    <section className="py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-baseline justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold">워치리스트</h2>
            <p className="text-gray-500 mt-1">
              총 {data.total_found}개 중 {Math.min(visibleCount, data.stocks.length)}개 표시
              {isRealtimeAvailable && (
                <span className="ml-2 text-green-500 text-xs">
                  실시간 시세 연동 중
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleStocks.map((stock, index) => (
            <StockCard
              key={stock.code}
              stock={stock}
              index={index}
              realtimePrice={realtimePrices[stock.code]}
              onClick={onStockClick}
            />
          ))}
        </div>

        {hasMore && (
          <div className="text-center mt-8">
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="text-sm text-gray-500 hover:text-black border border-gray-200 px-6 py-2.5 rounded-full hover:border-gray-400 transition-all"
            >
              더 보기 ({data.stocks.length - visibleCount}개 남음)
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
