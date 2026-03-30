'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface IndexData {
  name: string;
  code: string;
  price: number;
  change: number;
  changeRate: number;
  chart: { date: string; close: number }[];
}

interface MarketData {
  kospi: IndexData;
  kosdaq: IndexData;
}

/** SVG 미니 라인 차트 */
function MiniChart({ data, color }: { data: { close: number }[]; color: string }) {
  if (data.length < 2) return null;

  const width = 280;
  const height = 60;
  const padding = 2;

  const closes = data.map((d) => d.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const points = closes.map((v, i) => {
    const x = padding + (i / (closes.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathD = `M${points.join(' L')}`;
  const areaD = `${pathD} L${width - padding},${height} L${padding},${height} Z`;

  return (
    <svg width={width} height={height} className="mt-2">
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${color})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** 단일 지수 카드 */
function IndexCard({ data }: { data: IndexData }) {
  const isUp = data.change >= 0;
  const color = isUp ? '#ef4444' : '#3b82f6';
  const arrow = isUp ? '▲' : '▼';
  const sign = isUp ? '+' : '';

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-500">{data.name}</span>
        <span className={`text-xs font-medium ${isUp ? 'text-red-500' : 'text-blue-500'}`}>
          {arrow} {sign}{data.change.toFixed(2)} ({sign}{data.changeRate.toFixed(2)}%)
        </span>
      </div>
      <div className="text-3xl font-bold tracking-tight">
        {data.price.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <MiniChart data={data.chart.slice(-30)} color={color} />
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
      <section className="pt-16 pb-4 px-6">
        <div className="max-w-[980px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse">
              <div className="h-4 w-16 bg-gray-200 rounded mb-2" />
              <div className="h-8 w-32 bg-gray-200 rounded mb-3" />
              <div className="h-16 bg-gray-100 rounded" />
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
    <section className="pt-16 pb-4 px-6">
      <div className="max-w-[980px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
        <IndexCard data={data.kospi} />
        <IndexCard data={data.kosdaq} />
      </div>
    </section>
  );
}
