'use client';

import { useMemo, useState } from 'react';
import { useStockData } from './hooks/useStockData';
import { useRealtimePrice } from './hooks/useRealtimePrice';
import Navbar from './components/Navbar';
import MarketOverview from './components/MarketOverview';
import StockGrid from './components/StockGrid';
import StockChart from './components/StockChart';
import { SkeletonCard, SkeletonMarketOverview } from './components/SkeletonCard';
import type { Stock } from './types/stock';

export default function Home() {
  const { data, loading, error, lastUpdated, refresh } = useStockData(20);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);

  // 현재 표시 중인 종목 코드 목록
  const stockCodes = useMemo(
    () => (data?.stocks || []).slice(0, 10).map((s) => s.code),
    [data]
  );

  // 실시간 가격 폴링 (한투 API 연동 시 자동 활성화)
  const { prices: realtimePrices, isAvailable: isRealtimeAvailable } =
    useRealtimePrice(stockCodes);

  return (
    <div className="min-h-screen bg-white">
      <Navbar lastUpdated={lastUpdated} onRefresh={refresh} />

      {/* Hero - 간결하게 */}
      <section className="pt-24 pb-8 px-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3 bg-gradient-to-br from-gray-900 to-gray-600 bg-clip-text text-transparent">
            52주 신고가 추적
          </h1>
          <p className="text-gray-500 text-lg">
          </p>
          {error && (
            <div className="mt-4 text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg inline-block">
              {error} — 자동 재시도 중
            </div>
          )}
        </div>
      </section>

      {/* 로딩 스켈레톤 */}
      {loading && !data && (
        <>
          <SkeletonMarketOverview />
          <section className="py-12 px-6">
            <div className="max-w-7xl mx-auto">
              <div className="h-8 w-48 bg-gray-200 rounded mb-8 animate-pulse" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {/* 데이터 표시 */}
      {data && (
        <>
          <MarketOverview data={data} />
          <StockGrid
            data={data}
            realtimePrices={realtimePrices}
            isRealtimeAvailable={isRealtimeAvailable}
            onStockClick={setSelectedStock}
          />
        </>
      )}

      {/* 차트 모달 */}
      {selectedStock && (
        <StockChart
          stockCode={selectedStock.code}
          stockName={selectedStock.name}
          onClose={() => setSelectedStock(null)}
        />
      )}

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-100">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <p className="text-sm text-gray-400">
            © 2026 OURTLE. J.Kim of Unimind
          </p>
          {lastUpdated && (
            <p className="text-xs text-gray-300">
              마지막 업데이트: {lastUpdated.toLocaleString('ko-KR')}
            </p>
          )}
        </div>
      </footer>

      <style jsx global>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
