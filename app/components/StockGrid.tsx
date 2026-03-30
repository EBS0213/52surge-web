'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
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

export default function StockGrid({
  data,
  realtimePrices = {},
  isRealtimeAvailable = false,
  onStockClick,
}: StockGridProps) {
  const [currentPage, setCurrentPage] = useState(0);
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

  const stocks = data.stocks;
  const totalPages = Math.max(1, Math.ceil(stocks.length / cardsPerPage));

  // Clamp page if data changes
  useEffect(() => {
    if (currentPage >= totalPages) setCurrentPage(Math.max(0, totalPages - 1));
  }, [totalPages, currentPage]);

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
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">워치리스트</h2>
            <p className="text-gray-500 mt-1">
              총 {data.total_found}개
              {totalPages > 1 && (
                <span className="ml-2 text-gray-400">
                  ({currentPage + 1} / {totalPages} 페이지)
                </span>
              )}
              {isRealtimeAvailable && (
                <span className="ml-2 text-green-500 text-xs">
                  실시간 시세 연동 중
                </span>
              )}
            </p>
          </div>

          {/* Navigation arrows */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={goPrev}
                disabled={currentPage === 0}
                className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="이전"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                onClick={goNext}
                disabled={currentPage === totalPages - 1}
                className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="다음"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          )}
        </div>

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
