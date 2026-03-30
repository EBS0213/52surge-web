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
  period?: string;
}

type PeriodKey = '1w' | '3m' | '1y' | '3y';
const PERIOD_LABELS: { key: PeriodKey; label: string }[] = [
  { key: '1w', label: '1주' },
  { key: '3m', label: '3개월' },
  { key: '1y', label: '1년' },
  { key: '3y', label: '3년' },
];

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
  if (data.length < 3) return null;

  const ma5 = calcMA(data, 5);
  const ma10 = calcMA(data, 10);
  const ma20 = calcMA(data, 20);

  const padding = { top: 8, bottom: 20, left: 4, right: 4 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

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
      {data.map((d, i) => {
        const isUp = d.close >= d.open;
        const color = isUp ? '#ef4444' : '#3b82f6';
        const x = toX(i);
        const bodyTop = toY(Math.max(d.open, d.close));
        const bodyBottom = toY(Math.min(d.open, d.close));
        const bodyH = Math.max(0.5, bodyBottom - bodyTop);

        return (
          <g key={i}>
            <line
              x1={x} y1={toY(d.high)}
              x2={x} y2={toY(d.low)}
              stroke={color} strokeWidth={0.8}
            />
            <rect
              x={x - candleW / 2} y={bodyTop}
              width={candleW} height={bodyH}
              fill={color}
              stroke={color} strokeWidth={0.3}
            />
          </g>
        );
      })}

      <path d={maLine(ma5)} fill="none" stroke="#f59e0b" strokeWidth={1.2} strokeLinejoin="round" opacity={0.9} />
      <path d={maLine(ma10)} fill="none" stroke="#8b5cf6" strokeWidth={1.2} strokeLinejoin="round" opacity={0.9} />
      <path d={maLine(ma20)} fill="none" stroke="#06b6d4" strokeWidth={1.2} strokeLinejoin="round" opacity={0.9} />

      <g transform={`translate(${padding.left + 4}, ${height - 6})`}>
        <circle cx={0} cy={-3} r={3} fill="#f59e0b" />
        <text x={6} y={0} fontSize={8} fill="#a3a3a3">5</text>
        <circle cx={24} cy={-3} r={3} fill="#8b5cf6" />
        <text x={30} y={0} fontSize={8} fill="#a3a3a3">10</text>
        <circle cx={52} cy={-3} r={3} fill="#06b6d4" />
        <text x={58} y={0} fontSize={8} fill="#a3a3a3">20</text>
      </g>
    </svg>
  );
}

/** 단일 지수 카드 */
function IndexCard({
  data,
  expanded,
  onToggle,
  selectedPeriod,
  onPeriodChange,
  periodData,
  periodLoading,
}: {
  data: IndexData;
  expanded: boolean;
  onToggle: () => void;
  selectedPeriod: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  periodData: IndexData | null;
  periodLoading: boolean;
}) {
  const isUp = data.change >= 0;
  const arrow = isUp ? '▲' : '▼';
  const sign = isUp ? '+' : '';

  const chartData = data.chart.slice(-40);
  const { state, ma5, ma10, ma20 } = getMarketState(data.chart);
  const sc = stateColor(state);

  // 기간별 데이터가 있으면 해당 차트를 보여줌
  const displayChart = expanded && periodData ? periodData.chart : chartData;
  const displayMA = expanded && periodData ? getMarketState(periodData.chart) : { ma5, ma10, ma20 };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 hover:shadow-md transition-shadow overflow-hidden">
      {/* Header - 클릭 가능 */}
      <div className="p-5 pb-0 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-gray-800">{data.name}</span>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${sc.bg} ${sc.text} border ${sc.border}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${state === 'BULL' ? 'animate-pulse' : ''}`} />
              {state}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${isUp ? 'text-red-500' : 'text-blue-500'}`}>
              {arrow} {sign}{data.change.toFixed(2)} ({sign}{data.changeRate.toFixed(2)}%)
            </span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <div className="text-3xl font-bold tracking-tight mb-2">
          {data.price.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      {/* 기본 차트 (항상 표시) */}
      <div className="px-2">
        <CandleChart data={displayChart} width={540} height={expanded ? 200 : 160} />
      </div>

      {/* 확장 영역: 기간 선택 탭 + MA 정보 */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* 기간 선택 탭 */}
          <div className="px-5 py-3 flex items-center gap-2">
            {PERIOD_LABELS.map(({ key, label }) => (
              <button
                key={key}
                onClick={(e) => { e.stopPropagation(); onPeriodChange(key); }}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  selectedPeriod === key
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
            {periodLoading && (
              <span className="ml-2 text-xs text-gray-400 animate-pulse">불러오는 중...</span>
            )}
          </div>

          {/* MA 정보 */}
          <div className="px-5 py-3 border-t border-gray-50 flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              MA5: {displayMA.ma5.toFixed(1)}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />
              MA10: {displayMA.ma10.toFixed(1)}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
              MA20: {displayMA.ma20.toFixed(1)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MarketIndex() {
  const [data, setData] = useState<MarketData | null>(null);
  const [error, setError] = useState(false);
  const isMounted = useRef(true);

  // 확장 상태
  const [expandedIndex, setExpandedIndex] = useState<'kospi' | 'kosdaq' | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('3m');
  const [periodData, setPeriodData] = useState<MarketData | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);

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

  // 기간별 데이터 fetch
  const fetchPeriodData = useCallback(async (period: PeriodKey) => {
    if (period === '3m') {
      // 기본 데이터와 동일하므로 별도 fetch 불필요
      setPeriodData(null);
      return;
    }
    setPeriodLoading(true);
    try {
      const res = await fetch(`/api/market?period=${period}`);
      if (!res.ok) throw new Error('fetch failed');
      const result = await res.json();
      if (isMounted.current) setPeriodData(result);
    } catch {
      // 실패 시 기본 데이터 유지
    } finally {
      if (isMounted.current) setPeriodLoading(false);
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

  // 기간 변경 시 데이터 fetch
  const handlePeriodChange = useCallback((period: PeriodKey) => {
    setSelectedPeriod(period);
    fetchPeriodData(period);
  }, [fetchPeriodData]);

  const handleToggle = useCallback((index: 'kospi' | 'kosdaq') => {
    setExpandedIndex(prev => {
      if (prev === index) return null; // 접기
      return index; // 펼치기
    });
    // 다른 인덱스 선택 시 기간을 기본값으로 리셋
    setSelectedPeriod('3m');
    setPeriodData(null);
  }, []);

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

  // API 에러
  if (error || !data) {
    return (
      <section className="pt-4 pb-2 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 text-center">
              <p className="text-sm text-gray-400">지수 데이터를 불러오지 못했습니다</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="pt-4 pb-2 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
        <IndexCard
          data={data.kospi}
          expanded={expandedIndex === 'kospi'}
          onToggle={() => handleToggle('kospi')}
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
          periodData={expandedIndex === 'kospi' && periodData ? periodData.kospi : null}
          periodLoading={periodLoading && expandedIndex === 'kospi'}
        />
        <IndexCard
          data={data.kosdaq}
          expanded={expandedIndex === 'kosdaq'}
          onToggle={() => handleToggle('kosdaq')}
          selectedPeriod={selectedPeriod}
          onPeriodChange={handlePeriodChange}
          periodData={expandedIndex === 'kosdaq' && periodData ? periodData.kosdaq : null}
          periodLoading={periodLoading && expandedIndex === 'kosdaq'}
        />
      </div>
    </section>
  );
}
