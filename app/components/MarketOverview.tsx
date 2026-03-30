'use client';

import type { ScanResult } from '../types/stock';

interface MarketOverviewProps {
  data: ScanResult;
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

export default function MarketOverview({ data }: MarketOverviewProps) {
  return (
    <section className="pt-4 pb-2 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 rounded-2xl p-6 hover:bg-gray-100 transition-colors">
            <div className="text-xs text-gray-500 mb-1">거래일</div>
            <div className="text-2xl font-semibold">{data.trading_date}</div>
          </div>
          <div className="bg-gray-50 rounded-2xl p-6 hover:bg-gray-100 transition-colors">
            <div className="text-xs text-gray-500 mb-1">코스피 RSI</div>
            <div className={`text-2xl font-semibold ${getRSIColor(data.market_rsi.kospi)}`}>
              {data.market_rsi.kospi?.toFixed(1) || 'N/A'}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {getRSILabel(data.market_rsi.kospi)}
            </div>
          </div>
          <div className="bg-gray-50 rounded-2xl p-6 hover:bg-gray-100 transition-colors">
            <div className="text-xs text-gray-500 mb-1">코스닥 RSI</div>
            <div className={`text-2xl font-semibold ${getRSIColor(data.market_rsi.kosdaq)}`}>
              {data.market_rsi.kosdaq?.toFixed(1) || 'N/A'}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {getRSILabel(data.market_rsi.kosdaq)}
            </div>
          </div>
          <div className="bg-gray-50 rounded-2xl p-6 hover:bg-gray-100 transition-colors">
            <div className="text-xs text-gray-500 mb-1">신고가 종목 수</div>
            <div className="text-2xl font-semibold text-red-500">{data.total_found}개</div>
          </div>
        </div>
      </div>
    </section>
  );
}
