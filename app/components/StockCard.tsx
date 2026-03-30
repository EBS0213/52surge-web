'use client';

import { memo } from 'react';
import type { Stock } from '../types/stock';

interface RealtimePrice {
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  high: number;
  low: number;
  open: number;
}

interface StockCardProps {
  stock: Stock;
  index: number;
  realtimePrice?: RealtimePrice;
  onClick?: (stock: Stock) => void;
}

function StockCardInner({ stock, index, realtimePrice, onClick }: StockCardProps) {
  const displayPrice = realtimePrice?.price || stock.close;
  const priceChange = realtimePrice?.change;
  const changeRate = realtimePrice?.changeRate;
  const isLive = !!realtimePrice;

  return (
    <div
      className="group bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-xl hover:border-gray-300 transition-all duration-300 cursor-pointer"
      onClick={() => onClick?.(stock)}
      style={{
        animationDelay: `${index * 0.05}s`,
        animation: 'fadeInUp 0.4s ease-out forwards',
        opacity: 0,
      }}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold mb-0.5">{stock.name}</h3>
          <p className="text-xs text-gray-400">{stock.code}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {isLive && (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              LIVE
            </span>
          )}
          <div className="bg-black text-white px-2.5 py-0.5 rounded-full text-xs font-medium">
            신고가
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-xs text-gray-500 mb-0.5">
            {isLive ? '현재가' : '종가'}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">
              {displayPrice.toLocaleString()}
              <span className="text-sm text-gray-400 ml-0.5">원</span>
            </span>
            {isLive && priceChange !== undefined && changeRate !== undefined && (
              <span className={`text-sm font-semibold ${
                priceChange > 0 ? 'text-red-500' : priceChange < 0 ? 'text-blue-500' : 'text-gray-400'
              }`}>
                {priceChange > 0 ? '+' : ''}
                {changeRate.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-gray-500 mb-0.5">RSI</div>
            <div className={`text-base font-semibold ${
              stock.rsi >= 70 ? 'text-red-500' : stock.rsi <= 30 ? 'text-blue-500' : ''
            }`}>
              {stock.rsi.toFixed(1)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">거래량</div>
            <div className={`text-base font-semibold ${
              stock.volume_change_pct > 0 ? 'text-red-500' : 'text-blue-500'
            }`}>
              {stock.volume_change_pct > 0 ? '+' : ''}
              {stock.volume_change_pct.toFixed(0)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-0.5">거래대금</div>
            <div className="text-base font-medium">
              {(stock.trading_value / 100000000).toFixed(0)}억
            </div>
          </div>
        </div>

        {/* 실시간 고/저가 바 */}
        {isLive && realtimePrice && (
          <div className="pt-2 border-t border-gray-100">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>{realtimePrice.low.toLocaleString()}</span>
              <span>{realtimePrice.high.toLocaleString()}</span>
            </div>
            <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
              {(() => {
                const range = realtimePrice.high - realtimePrice.low || 1;
                const pos = ((realtimePrice.price - realtimePrice.low) / range) * 100;
                return (
                  <div
                    className="absolute top-0 h-full bg-gradient-to-r from-blue-400 to-red-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(2, pos))}%` }}
                  />
                );
              })()}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>저가</span>
              <span>고가</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const StockCard = memo(StockCardInner);
export default StockCard;
