'use client';

import { useMemo, useState } from 'react';
import { useStockData } from './hooks/useStockData';
import { useRealtimePrice } from './hooks/useRealtimePrice';
import Navbar from './components/Navbar';
import MarketIndex from './components/MarketIndex';
import MarketOverview from './components/MarketOverview';
import StockGrid from './components/StockGrid';
import StockChart from './components/StockChart';
import { SkeletonCard, SkeletonMarketOverview } from './components/SkeletonCard';
import NewsSection from './components/NewsSection';
import type { Stock } from './types/stock';

export default function Home() {
  const { data, loading, error, lastUpdated, refresh } = useStockData(20);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);

  const stockCodes = useMemo(
    () => (data?.stocks || []).slice(0, 10).map((s) => s.code),
    [data]
  );

  const { prices: realtimePrices, isAvailable: isRealtimeAvailable } =
    useRealtimePrice(stockCodes);

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <Navbar lastUpdated={lastUpdated} onRefresh={refresh} />

      {/* KOSPI / KOSDAQ 지수 */}
      <MarketIndex />

      {error && (
        <div className="max-w-[980px] mx-auto px-6 mt-4">
          <div className="text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg inline-block">
            {error} — 자동 재시도 중
          </div>
        </div>
      )}

      {/* 로딩 스켈레톤 */}
      {loading && !data && (
        <>
          <SkeletonMarketOverview />
          <section className="py-8 px-6">
            <div className="max-w-[980px] mx-auto">
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

      {/* 경제 뉴스 */}
      <NewsSection />

      {/* 차트 모달 */}
      {selectedStock && (
        <StockChart
          stockCode={selectedStock.code}
          stockName={selectedStock.name}
          onClose={() => setSelectedStock(null)}
        />
      )}

      {/* Footer */}
      <footer className="py-8 px-6 bg-[#f5f5f7]">
        <div className="max-w-[980px] mx-auto flex items-center justify-between border-t border-gray-200 pt-6">
          <p className="text-xs text-[#86868b]">
            © 2026 OURTLE. J.Kim of Unimind
          </p>
          {lastUpdated && (
            <p className="text-xs text-[#86868b]">
              {lastUpdated.toLocaleString('ko-KR')}
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
