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

/** 컴팩트 세로 레이아웃 (지수 카드 옆에 배치용) */
export default function MarketOverview({ data }: MarketOverviewProps) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="bg-white rounded-xl p-3 border border-gray-100">
        <div className="text-[10px] text-gray-400 mb-0.5">거래일</div>
        <div className="text-sm font-semibold text-gray-900">{data.trading_date}</div>
      </div>
      <div className="bg-white rounded-xl p-3 border border-gray-100">
        <div className="text-[10px] text-gray-400 mb-0.5">코스피 RSI</div>
        <div className={`text-sm font-semibold ${getRSIColor(data.market_rsi.kospi)}`}>
          {data.market_rsi.kospi?.toFixed(1) || 'N/A'}
        </div>
        <div className="text-[10px] text-gray-400">{getRSILabel(data.market_rsi.kospi)}</div>
      </div>
      <div className="bg-white rounded-xl p-3 border border-gray-100">
        <div className="text-[10px] text-gray-400 mb-0.5">코스닥 RSI</div>
        <div className={`text-sm font-semibold ${getRSIColor(data.market_rsi.kosdaq)}`}>
          {data.market_rsi.kosdaq?.toFixed(1) || 'N/A'}
        </div>
        <div className="text-[10px] text-gray-400">{getRSILabel(data.market_rsi.kosdaq)}</div>
      </div>
      <div className="bg-white rounded-xl p-3 border border-gray-100">
        <div className="text-[10px] text-gray-400 mb-0.5">신고가 종목</div>
        <div className="text-sm font-semibold text-red-500">{data.total_found}개</div>
      </div>
    </div>
  );
}
