'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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

/** 필터 설정 */
interface FilterState {
  rsiMin: number;
  rsiMax: number;
  volumeChangeMin: number;  // 거래량 변화율 최소 (%)
  tradingValueMin: number;  // 거래대금 최소 (억)
  volumeMin: number;        // 거래량 최소 (만주)
}

const DEFAULT_FILTERS: FilterState = {
  rsiMin: 0,
  rsiMax: 100,
  volumeChangeMin: 0,
  tradingValueMin: 0,
  volumeMin: 0,
};

/** 필터 패널 — Enter키 또는 적용 버튼으로 필터 적용 */
function FilterPanel({
  filters,
  onApply,
  onReset,
  onClose,
  matchCount,
  totalCount,
}: {
  filters: FilterState;
  onApply: (f: FilterState) => void;
  onReset: () => void;
  onClose: () => void;
  matchCount: number;
  totalCount: number;
}) {
  // 로컬 draft 상태 (적용 전까지 부모에 전달 안 함)
  const [draft, setDraft] = useState<FilterState>(filters);

  const inputClass =
    'w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent';

  const isDefault =
    filters.rsiMin === 0 &&
    filters.rsiMax === 100 &&
    filters.volumeChangeMin === 0 &&
    filters.tradingValueMin === 0 &&
    filters.volumeMin === 0;

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  const handleReset = () => {
    setDraft(DEFAULT_FILTERS);
    onReset();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4" onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">
          필터 적용 중: <span className="font-semibold text-gray-900">{matchCount}</span>
          <span className="text-gray-400">/{totalCount}</span>
        </span>
        {!isDefault && (
          <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            초기화
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">RSI 최소</label>
          <input
            className={inputClass}
            type="text"
            inputMode="numeric"
            value={draft.rsiMin || ''}
            onChange={(e) => setDraft({ ...draft, rsiMin: Number(e.target.value) || 0 })}
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">RSI 최대</label>
          <input
            className={inputClass}
            type="text"
            inputMode="numeric"
            value={draft.rsiMax === 100 ? '' : draft.rsiMax}
            onChange={(e) => setDraft({ ...draft, rsiMax: Number(e.target.value) || 100 })}
            placeholder="100"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">거래량 (만주 이상)</label>
          <input
            className={inputClass}
            type="text"
            inputMode="numeric"
            value={draft.volumeMin || ''}
            onChange={(e) => setDraft({ ...draft, volumeMin: Number(e.target.value) || 0 })}
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">거래량 변화율 (% 이상)</label>
          <input
            className={inputClass}
            type="text"
            inputMode="decimal"
            value={draft.volumeChangeMin || ''}
            onChange={(e) => setDraft({ ...draft, volumeChangeMin: Number(e.target.value) || 0 })}
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">거래대금 (억 이상)</label>
          <input
            className={inputClass}
            type="text"
            inputMode="numeric"
            value={draft.tradingValueMin || ''}
            onChange={(e) => setDraft({ ...draft, tradingValueMin: Number(e.target.value) || 0 })}
            placeholder="0"
          />
        </div>
      </div>

      {/* 기본 선별 안내 + 적용 버튼 */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
        <p className="text-[10px] text-gray-400">
          기본 선별: KRX 전 종목 중 52주 신고가 돌파 + 거래량 100만주↑ + 거래대금 50억↑ + RSI 60↑ 충족 종목
        </p>
        <button
          onClick={handleApply}
          className="ml-3 px-4 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-full hover:bg-gray-800 transition-colors shrink-0"
        >
          적용
        </button>
      </div>
    </div>
  );
}

export default function StockGrid({
  data,
  realtimePrices = {},
  isRealtimeAvailable = false,
  onStockClick,
}: StockGridProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [isAnimating, setIsAnimating] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<number>(0);
  const touchDeltaRef = useRef<number>(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Responsive: detect cards per page
  const [cardsPerPage, setCardsPerPage] = useState(4);

  useEffect(() => {
    function updateCardsPerPage() {
      const w = window.innerWidth;
      if (w < 768) setCardsPerPage(1);
      else if (w < 1024) setCardsPerPage(2);
      else if (w < 1280) setCardsPerPage(3);
      else setCardsPerPage(4);
    }
    updateCardsPerPage();
    window.addEventListener('resize', updateCardsPerPage);
    return () => window.removeEventListener('resize', updateCardsPerPage);
  }, []);

  // 필터 적용 (기본값일 때는 필터 안 함, undefined/null 안전 처리)
  const stocks = useMemo(() => {
    return data.stocks.filter((s) => {
      const rsi = s.rsi ?? 0;
      const vol = (s.volume ?? 0) / 10_000;  // 만주 단위
      const volChange = s.volume_change_pct ?? 0;
      const tradingVal = (s.trading_value ?? 0) / 100_000_000;

      if (filters.rsiMin > 0 && rsi < filters.rsiMin) return false;
      if (filters.rsiMax < 100 && rsi > filters.rsiMax) return false;
      if (filters.volumeMin > 0 && vol < filters.volumeMin) return false;
      if (filters.volumeChangeMin > 0 && volChange < filters.volumeChangeMin) return false;
      if (filters.tradingValueMin > 0 && tradingVal < filters.tradingValueMin) return false;
      return true;
    });
  }, [data.stocks, filters]);

  const isFiltered =
    filters.rsiMin !== 0 ||
    filters.rsiMax !== 100 ||
    filters.volumeMin !== 0 ||
    filters.volumeChangeMin !== 0 ||
    filters.tradingValueMin !== 0;

  const totalPages = Math.max(1, Math.ceil(stocks.length / cardsPerPage));

  // Clamp page if data/filter changes
  useEffect(() => {
    if (currentPage >= totalPages) setCurrentPage(Math.max(0, totalPages - 1));
  }, [totalPages, currentPage]);

  // 필터 변경 시 첫 페이지로
  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
    setCurrentPage(0);
  }, []);

  const goToPage = useCallback(
    (page: number) => {
      if (page < 0 || page >= totalPages || page === currentPage || isAnimating) return;
      setSlideDirection(page > currentPage ? 'left' : 'right');
      setIsAnimating(true);
      setCurrentPage(page);
      setTimeout(() => {
        setIsAnimating(false);
        setSlideDirection(null);
      }, 400);
    },
    [currentPage, totalPages, isAnimating]
  );

  const goNext = useCallback(() => goToPage(currentPage + 1), [goToPage, currentPage]);
  const goPrev = useCallback(() => goToPage(currentPage - 1), [goToPage, currentPage]);

  // Touch / drag handlers
  const handleTouchStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    touchStartRef.current = clientX;
    touchDeltaRef.current = 0;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const delta = clientX - touchStartRef.current;
      touchDeltaRef.current = delta;
      setDragOffset(delta);
    },
    [isDragging]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    const threshold = 80;
    if (touchDeltaRef.current < -threshold) {
      goNext();
    } else if (touchDeltaRef.current > threshold) {
      goPrev();
    }
    setDragOffset(0);
  }, [isDragging, goNext, goPrev]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev]);

  const pageStocks = stocks.slice(
    currentPage * cardsPerPage,
    currentPage * cardsPerPage + cardsPerPage
  );

  return (
    <section className="pt-6 pb-4 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1">
            <h2 className="text-2xl font-bold mr-1">워치리스트</h2>
            {/* 필터 토글 — 타이틀 바로 옆 */}
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded-full transition-colors ${
                showFilter || isFiltered
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <svg className="w-2.5 h-2.5 inline-block mr-0.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              필터{isFiltered ? ' ON' : ''}
            </button>
            <span className="text-xs text-gray-400 ml-1">
              {isFiltered ? `${stocks.length}/${data.total_found}` : `${data.total_found}개`}
              {isRealtimeAvailable && <span className="ml-1 text-green-500">LIVE</span>}
            </span>
          </div>

          {/* Navigation arrows + 페이지 표시 */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 mr-1">{currentPage + 1}/{totalPages}</span>
              <button
                onClick={goPrev}
                disabled={currentPage === 0}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="이전"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                onClick={goNext}
                disabled={currentPage === totalPages - 1}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="다음"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* 필터 패널 */}
        {showFilter && (
          <FilterPanel
            filters={filters}
            onApply={handleFilterChange}
            onReset={() => handleFilterChange(DEFAULT_FILTERS)}
            onClose={() => setShowFilter(false)}
            matchCount={stocks.length}
            totalCount={data.total_found}
          />
        )}

        {/* Slide container */}
        <div
          className="overflow-hidden relative"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleTouchStart}
          onMouseMove={handleTouchMove}
          onMouseUp={handleTouchEnd}
          onMouseLeave={() => {
            if (isDragging) handleTouchEnd();
          }}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <div
            ref={trackRef}
            className="transition-all duration-400 ease-out"
            style={{
              transform: isDragging
                ? `translateX(${dragOffset}px)`
                : slideDirection === 'left'
                ? 'translateX(0)'
                : slideDirection === 'right'
                ? 'translateX(0)'
                : 'translateX(0)',
              transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
          >
            <div
              className={`grid gap-4 ${
                cardsPerPage === 1
                  ? 'grid-cols-1'
                  : cardsPerPage === 2
                  ? 'grid-cols-2'
                  : cardsPerPage === 3
                  ? 'grid-cols-3'
                  : 'grid-cols-4'
              }`}
              style={{
                animation: isAnimating
                  ? slideDirection === 'left'
                    ? 'slideInFromRight 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards'
                    : 'slideInFromLeft 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards'
                  : undefined,
              }}
            >
              {pageStocks.map((stock, index) => (
                <StockCard
                  key={stock.code}
                  stock={stock}
                  index={index}
                  realtimePrice={realtimePrices[stock.code]}
                  onClick={onStockClick}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Dot indicators */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-4">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => goToPage(i)}
                className={`transition-all duration-300 rounded-full ${
                  i === currentPage
                    ? 'w-8 h-2.5 bg-black'
                    : 'w-2.5 h-2.5 bg-gray-300 hover:bg-gray-400'
                }`}
                aria-label={`${i + 1}페이지`}
              />
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slideInFromRight {
          from {
            opacity: 0;
            transform: translateX(60px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slideInFromLeft {
          from {
            opacity: 0;
            transform: translateX(-60px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </section>
  );
}
