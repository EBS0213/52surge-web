'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface IndexData {
  name: string;
  code: string;
  price: number;
  change: number;
  changeRate: number;
  chart: CandleData[];
}

interface MarketData {
  kospi: IndexData;
  kosdaq: IndexData;
}

/** 이동평균 계산 */
function calcMA(data: CandleData[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += data[j].close;
    }
    return sum / period;
  });
}

/** 시장 상태 판단 */
type MarketState = 'BULL' | 'NORMAL' | 'BEAR';

function getMarketState(data: CandleData[]): { state: MarketState; ma5: number; ma10: number; ma20: number } {
  const closes = data.map(d => d.close);
  const len = closes.length;
  if (len < 20) return { state: 'NORMAL', ma5: 0, ma10: 0, ma20: 0 };

  const ma5 = closes.slice(len - 5).reduce((a, b) => a + b, 0) / 5;
  const ma10 = closes.slice(len - 10).reduce((a, b) => a + b, 0) / 10;
  const ma20 = closes.slice(len - 20).reduce((a, b) => a + b, 0) / 20;
  const current = closes[len - 1];

  let state: MarketState;
  if (current > ma5) {
    state = 'BULL';
  } else if (current < ma20) {
    state = 'BEAR';
  } else {
    state = 'NORMAL';
  }

  return { state, ma5, ma10, ma20 };
}

function stateColor(s: MarketState) {
  if (s === 'BULL') return { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', dot: 'bg-red-500' };
  if (s === 'BEAR') return { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', dot: 'bg-blue-500' };
  return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400' };
}

/** SVG 캔들차트 + 이동평균선 */
function CandleChart({ data, width, height }: { data: CandleData[]; width: number; height: number }) {
  if (data.length < 5) return null;

  const ma5 = calcMA(data, 5);
  const ma10 = calcMA(data, 10);
  const ma20 = calcMA(data, 20);

  const padding = { top: 8, bottom: 20, left: 4, right: 4 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Find min/max across all data
  let allMin = Infinity;
  let allMax = -Infinity;
  for (const d of data) {
    if (d.low < allMin) allMin = d.low;
    if (d.high > allMax) allMax = d.high;
  }
  const range = allMax - allMin || 1;

  const candleW = Math.max(1, (chartW / data.length) * 0.6);
  const gap = chartW / data.length;

  const toY = (v: number) => padding.top + chartH - ((v - allMin) / range) * chartH;
  const toX = (i: number) => padding.left + gap * i + gap / 2;

  // Build MA line paths
  const maLine = (values: (number | null)[]) => {
    let path = '';
    for (let i = 0; i < values.length; i++) {
      if (values[i] === null) continue;
      const x = toX(i);
      const y = toY(values[i]!);
      path += path === '' ? `M${x},${y}` : ` L${x},${y}`;
    }
    return path;
  };

  return (
    <svg width={width} height={height} className="block">
      {/* Candles */}
      {data.map((d, i) => {
        const isUp = d.close >= d.open;
        const color = isUp ? '#ef4444' : '#3b82f6';
        const x = toX(i);
        const bodyTop = toY(Math.max(d.open, d.close));
        const bodyBottom = toY(Math.min(d.open, d.close));
        const bodyH = Math.max(0.5, bodyBottom - bodyTop);

        return (
          <g key={i}>
            {/* Wick */}
            <line
              x1={x} y1={toY(d.high)}
              x2={x} y2={toY(d.low)}
              stroke={color} strokeWidth={0.8}
            />
            {/* Body */}
            <rect
              x={x - candleW / 2} y={bodyTop}
              width={candleW} height={bodyH}
              fill={isUp ? color : color}
              stroke={color} strokeWidth={0.3}
            />
          </g>
        );
      })}

      {/* MA lines */}
      <path d={maLine(ma5)} fill="none" stroke="#f59e0b" strokeWidth={1.2} strokeLinejoin="round" opacity={0.9} />
      <path d={maLine(ma10)} fill="none" stroke="#8b5cf6" strokeWidth={1.2} strokeLinejoin="round" opacity={0.9} />
      <path d={maLine(ma20)} fill="none" stroke="#06b6d4" strokeWidth={1.2} strokeLinejoin="round" opacity={0.9} />

      {/* MA Legend */}
      <g transform={`translate(${padding.left + 4}, ${height - 6})`}>
        <circle cx={0} cy={-3} r={3} fill="#f59e0b" />
        <text x={6} y={0} fontSize={8} fill="#a3a3a3">5일</text>
        <circle cx={32} cy={-3} r={3} fill="#8b5cf6" />
        <text x={38} y={0} fontSize={8} fill="#a3a3a3">10일</text>
        <circle cx={68} cy={-3} r={3} fill="#06b6d4" />
        <text x={74} y={0} fontSize={8} fill="#a3a3a3">20일</text>
      </g>
    </svg>
  );
}

/** 단일 지수 카드 */
function IndexCard({ data }: { data: IndexData }) {
  const isUp = data.change >= 0;
  const arrow = isUp ? '▲' : '▼';
  const sign = isUp ? '+' : '';

  const chartData = data.chart.slice(-40);
  const { state, ma5, ma10, ma20 } = getMarketState(data.chart);
  const sc = stateColor(state);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 hover:shadow-md transition-shadow overflow-hidden">
      {/* Header */}
      <div className="p-5 pb-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-gray-800">{data.name}</span>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${sc.bg} ${sc.text} border ${sc.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${state === 'BULL' ? 'animate-pulse' : ''}`} />
              {state}
            </span>
          </div>
          <span className={`text-xs font-medium ${isUp ? 'text-red-500' : 'text-blue-500'}`}>
            {arrow} {sign}{data.change.toFixed(2)} ({sign}{data.changeRate.toFixed(2)}%)
          </span>
        </div>
        <div className="text-3xl font-bold tracking-tight mb-2">
          {data.price.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      {/* Chart */}
      <div className="px-2">
        <CandleChart data={chartData} width={540} height={160} />
      </div>

      {/* MA Info Row */}
      <div className="px-5 py-3 border-t border-gray-50 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          MA5: {ma5.toFixed(1)}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />
          MA10: {ma10.toFixed(1)}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
          MA20: {ma20.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export default function MarketIndex() {
  const [data, setData] = useState<MarketData | null>(null);
  const [error, setError] = useState(false);
  const isMounted = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/market');
      if (!res.ok) {
        setError(true);
        return;
      }
      const result = await res.json();
      if (isMounted.current) setData(result);
    } catch {
      if (isMounted.current) setError(true);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [fetchData]);

  // 로딩 중
  if (!data && !error) {
    return (
      <section className="pt-4 pb-2 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse">
              <div className="h-4 w-20 bg-gray-200 rounded mb-2" />
              <div className="h-8 w-36 bg-gray-200 rounded mb-3" />
              <div className="h-40 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // API 에러 시 숨김
  if (error || !data) {
    return null;
  }

  return (
    <section className="pt-4 pb-2 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
        <IndexCard data={data.kospi} />
        <IndexCard data={data.kosdaq} />
      </div>
    </section>
  );
}
