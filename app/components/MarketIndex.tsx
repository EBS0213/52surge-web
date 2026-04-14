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
  investor?: InvestorData | null;
}

interface MarketData {
  kospi: IndexData;
  kosdaq: IndexData;
  period?: string;
}

type PeriodKey = 'daily' | 'weekly' | 'monthly';

const PERIOD_LABELS: { key: PeriodKey; label: string }[] = [
  { key: 'daily', label: '일봉' },
  { key: 'weekly', label: '주봉' },
  { key: 'monthly', label: '월봉' },
];

// 오버레이 토글 키
type OverlayKey = 'ma5' | 'ma20' | 'ma50' | 'bb';
const OVERLAY_LABELS: { key: OverlayKey; label: string; color: string }[] = [
  { key: 'ma5', label: 'MA5', color: '#f59e0b' },
  { key: 'ma20', label: 'MA20', color: '#8b5cf6' },
  { key: 'ma50', label: 'MA50', color: '#06b6d4' },
  { key: 'bb', label: 'BB', color: '#ec4899' },
];

interface InvestorData {
  frgn: number;
  inst: number;
  prsn: number;
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

/** 볼린저밴드 계산 (20일, 2표준편차) */
function calcBB(data: CandleData[], period = 20, mult = 2): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const upper: (number | null)[] = [];
  const middle: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { upper.push(null); middle.push(null); lower.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    const avg = sum / period;
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) sqSum += (data[j].close - avg) ** 2;
    const std = Math.sqrt(sqSum / period);
    middle.push(avg);
    upper.push(avg + mult * std);
    lower.push(avg - mult * std);
  }
  return { upper, middle, lower };
}

/** 시장 상태 판단
 * 이동평균 정배열/역배열 + 당일 등락으로 판정
 * BULL: 정배열 (MA5 > MA20, MA50 있으면 MA20 > MA50) — 상승 추세
 * BEAR: 역배열 (MA5 < MA20, MA50 있으면 MA20 < MA50) — 하락 추세
 * FEAR: 당일 하락 + 종가가 MA20 또는 MA50 아래로 이탈 (급락/공포 구간)
 * NORMAL: 그 외 (혼조, 회복 구간 등)
 */
type MarketState = 'BULL' | 'NORMAL' | 'BEAR' | 'FEAR';

function getMarketState(data: CandleData[]): { state: MarketState; ma5: number; ma20: number; ma50: number } {
  const closes = data.map(d => d.close);
  const len = closes.length;
  if (len < 20) return { state: 'NORMAL', ma5: 0, ma20: 0, ma50: 0 };

  const ma5 = closes.slice(len - 5).reduce((a, b) => a + b, 0) / 5;
  const ma20 = closes.slice(len - 20).reduce((a, b) => a + b, 0) / 20;
  const ma50 = len >= 50 ? closes.slice(len - 50).reduce((a, b) => a + b, 0) / 50 : 0;
  const todayClose = closes[len - 1];
  const prevClose = len >= 2 ? closes[len - 2] : todayClose;
  const dailyChange = todayClose - prevClose;

  let state: MarketState;

  // FEAR: 당일 하락 + 종가가 MA20 또는 MA50 아래로 이탈
  if (dailyChange < 0 && (todayClose < ma20 || (ma50 > 0 && todayClose < ma50))) {
    state = 'FEAR';
  }
  // BULL: 정배열 (단기 > 중기 > 장기)
  else if (ma5 > ma20 && (ma50 === 0 || ma20 > ma50)) {
    state = 'BULL';
  }
  // BEAR: 역배열 (단기 < 중기 < 장기)
  else if (ma5 < ma20 && (ma50 === 0 || ma20 < ma50)) {
    state = 'BEAR';
  }
  // NORMAL: 그 외 (골든/데드크로스 혼조, 회복 구간)
  else {
    state = 'NORMAL';
  }

  return { state, ma5, ma20, ma50 };
}

function stateColor(s: MarketState) {
  if (s === 'BULL') return { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', dot: 'bg-red-500' };
  if (s === 'FEAR') return { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200', dot: 'bg-violet-500' };
  if (s === 'BEAR') return { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', dot: 'bg-blue-500' };
  return { bg: 'bg-yellow-50', text: 'text-yellow-600', border: 'border-yellow-200', dot: 'bg-yellow-500' };
}


/** 날짜 포맷 (일봉: "20260330" → "3/30", 분봉: "0930" or "093000" → "09:30") */
function formatDateLabel(dateStr: string): string {
  if (dateStr.length <= 6 && /^\d{4,6}$/.test(dateStr)) {
    const hh = dateStr.slice(0, 2);
    const mm = dateStr.slice(2, 4);
    return `${hh}:${mm}`;
  }
  if (dateStr.length === 8) {
    const m = dateStr.slice(4, 6);
    const d = dateStr.slice(6, 8);
    return `${Number(m)}/${Number(d)}`;
  }
  return dateStr;
}

/** Y축 가격 포맷 */
function formatPrice(v: number): string {
  if (v >= 10000) return v.toFixed(0);
  if (v >= 1000) return v.toFixed(1);
  return v.toFixed(2);
}

/** 공통 차트 레이아웃 계산 */
function useChartSize(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [width, setWidth] = useState(500);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [containerRef]);

  return width;
}

/** SVG 캔들차트 + 이동평균선 + 볼린저밴드 */
const DISPLAY_CANDLES = 45; // 차트에 보여줄 캔들 수 (최근 ~2개월)

function CandleChart({ data, height, overlays = new Set(), yAxisMin }: { data: CandleData[]; height: number; overlays?: Set<OverlayKey>; yAxisMin?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useChartSize(containerRef);

  if (data.length < 3) return <div ref={containerRef} className="w-full" />;

  // 전체 데이터로 MA/BB 계산 (정확한 값)
  const ma5Full = overlays.has('ma5') ? calcMA(data, 5) : [];
  const ma20Full = overlays.has('ma20') ? calcMA(data, 20) : [];
  const ma50Full = overlays.has('ma50') ? calcMA(data, 50) : [];
  const bbFull = overlays.has('bb') ? calcBB(data) : null;

  // 차트 표시 영역: 마지막 DISPLAY_CANDLES 개만 (캔들 + MA/BB 슬라이스)
  const offset = Math.max(0, data.length - DISPLAY_CANDLES);
  const displayData = data.slice(offset);
  const ma5 = ma5Full.slice(offset);
  const ma20 = ma20Full.slice(offset);
  const ma50 = ma50Full.slice(offset);
  const bb = bbFull ? {
    upper: bbFull.upper.slice(offset),
    middle: bbFull.middle.slice(offset),
    lower: bbFull.lower.slice(offset),
  } : null;

  const padding = { top: 8, bottom: 28, left: 4, right: 52 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  let allMin = Infinity;
  let allMax = -Infinity;
  for (const d of displayData) {
    if (d.low < allMin) allMin = d.low;
    if (d.high > allMax) allMax = d.high;
  }
  // BB 밴드가 Y축 범위에 포함되도록 확장
  if (bb) {
    for (const v of bb.upper) { if (v !== null && v > allMax) allMax = v; }
    for (const v of bb.lower) { if (v !== null && v < allMin) allMin = v; }
  }
  // Y축 최소값 강제 설정 (KOSPI 4000, KOSDAQ 890 등)
  if (yAxisMin !== undefined) allMin = Math.min(allMin, yAxisMin);
  const range = allMax - allMin || 1;

  const candleW = Math.max(1, (chartW / displayData.length) * 0.6);
  const gap = chartW / displayData.length;

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

  const yTicks = 5;
  const yTickValues: number[] = [];
  for (let i = 0; i < yTicks; i++) {
    yTickValues.push(allMin + (range * i) / (yTicks - 1));
  }

  const xLabelCount = Math.min(6, displayData.length);
  const xLabelIndices: number[] = [];
  for (let i = 0; i < xLabelCount; i++) {
    xLabelIndices.push(Math.round((i * (displayData.length - 1)) / (xLabelCount - 1)));
  }

  return (
    <div ref={containerRef} className="w-full">
    <svg width={width} height={height} className="block">
      {yTickValues.map((v, i) => (
        <line
          key={`yg-${i}`}
          x1={padding.left} y1={toY(v)}
          x2={padding.left + chartW} y2={toY(v)}
          stroke="#f0f0f0" strokeWidth={0.8} strokeDasharray="3,3"
        />
      ))}

      {displayData.map((d, i) => {
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

      {/* 볼린저밴드 */}
      {bb && (
        <>
          <path d={maLine(bb.upper)} fill="none" stroke="#ec4899" strokeWidth={0.8} strokeDasharray="4,2" opacity={0.6} />
          <path d={maLine(bb.middle)} fill="none" stroke="#ec4899" strokeWidth={0.8} opacity={0.4} />
          <path d={maLine(bb.lower)} fill="none" stroke="#ec4899" strokeWidth={0.8} strokeDasharray="4,2" opacity={0.6} />
        </>
      )}

      {/* 이동평균선 */}
      {ma5.length > 0 && <path d={maLine(ma5)} fill="none" stroke="#f59e0b" strokeWidth={1.2} strokeLinejoin="round" opacity={0.9} />}
      {ma20.length > 0 && <path d={maLine(ma20)} fill="none" stroke="#8b5cf6" strokeWidth={1.2} strokeLinejoin="round" opacity={0.9} />}
      {ma50.length > 0 && <path d={maLine(ma50)} fill="none" stroke="#06b6d4" strokeWidth={1.2} strokeLinejoin="round" opacity={0.9} />}

      {yTickValues.map((v, i) => (
        <text
          key={`yt-${i}`}
          x={padding.left + chartW + 6}
          y={toY(v) + 3}
          fontSize={9}
          fill="#a3a3a3"
          textAnchor="start"
        >
          {formatPrice(v)}
        </text>
      ))}

      {xLabelIndices.map((idx) => (
        <text
          key={`xl-${idx}`}
          x={toX(idx)}
          y={height - 4}
          fontSize={9}
          fill="#a3a3a3"
          textAnchor="middle"
        >
          {formatDateLabel(displayData[idx].date)}
        </text>
      ))}

      {/* MA/BB 범례 */}
      {(ma5.length > 0 || ma20.length > 0 || ma50.length > 0 || bb) && (
        <g transform={`translate(${padding.left + 4}, ${height - padding.bottom - 4})`}>
          {(() => {
            let xOff = 0;
            const items: { color: string; label: string }[] = [];
            if (ma5.length > 0) items.push({ color: '#f59e0b', label: 'MA5' });
            if (ma20.length > 0) items.push({ color: '#8b5cf6', label: 'MA20' });
            if (ma50.length > 0) items.push({ color: '#06b6d4', label: 'MA50' });
            if (bb) items.push({ color: '#ec4899', label: 'BB' });
            return items.map((it, i) => {
              const x = xOff;
              xOff += it.label.length * 6 + 16;
              return (
                <g key={i}>
                  <circle cx={x} cy={-3} r={3} fill={it.color} />
                  <text x={x + 6} y={0} fontSize={8} fill="#a3a3a3">{it.label}</text>
                </g>
              );
            });
          })()}
        </g>
      )}
    </svg>
    </div>
  );
}



/** 수급 표시 포맷: 억원 */
function formatInvestor(v: number): string {
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toLocaleString()}`;
}

/** Y축 최소값: 지수별 기준선 */
const Y_AXIS_MIN: Record<string, number> = {
  '0001': 4000,  // KOSPI
  '1001': 890,   // KOSDAQ
};

/** 단일 지수 카드 */
const defaultPeriod: PeriodKey = 'daily';

function IndexCard({ data, investor }: { data: IndexData; investor?: InvestorData | null }) {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>(defaultPeriod);
  const [periodChartData, setPeriodChartData] = useState<IndexData | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [activeOverlays, setActiveOverlays] = useState<Set<OverlayKey>>(new Set(['ma5', 'ma20']));
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const toggleOverlay = (key: OverlayKey) => {
    setActiveOverlays(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const isUp = data.change >= 0;
  const arrow = isUp ? '▲' : '▼';
  const sign = isUp ? '+' : '';

  const chartData = data.chart;
  const { state, ma5, ma20, ma50 } = getMarketState(data.chart);
  const sc = stateColor(state);

  const displayChart = periodChartData ? periodChartData.chart : chartData;
  const displayMA = periodChartData ? getMarketState(periodChartData.chart) : { ma5, ma20, ma50 };

  const handlePeriodChange = useCallback(async (period: PeriodKey) => {
    setSelectedPeriod(period);
    if (period === defaultPeriod) {
      setPeriodChartData(null);
      return;
    }
    setPeriodLoading(true);
    try {
      const res = await fetch(`/api/market?period=${period}`);
      if (!res.ok) throw new Error('fetch failed');
      const result = await res.json();
      if (isMounted.current) {
        const target = data.code === '0001' ? result.kospi : result.kosdaq;
        setPeriodChartData(target);
      }
    } catch {
      // 실패 시 유지
    } finally {
      if (isMounted.current) setPeriodLoading(false);
    }
  }, [data.code]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
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

      {/* 차트 */}
      <div className="px-2">
        <CandleChart data={displayChart} height={220} overlays={activeOverlays} yAxisMin={Y_AXIS_MIN[data.code]} />
      </div>

      {/* 기간 선택 + 수급 */}
      <div className="border-t border-gray-100">
        <div className="px-5 py-3">
          {/* 기간 선택 + 오버레이 토글 */}
          <div className="flex items-center gap-1 flex-wrap">
            {PERIOD_LABELS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handlePeriodChange(key)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  selectedPeriod === key
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
            <span className="w-px h-4 bg-gray-200 mx-1" />
            {OVERLAY_LABELS.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => toggleOverlay(key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors border ${
                  activeOverlays.has(key)
                    ? 'text-white border-transparent'
                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                }`}
                style={activeOverlays.has(key) ? { backgroundColor: color } : {}}
              >
                {label}
              </button>
            ))}
            {periodLoading && (
              <span className="ml-2 text-xs text-gray-400 animate-pulse">불러오는 중...</span>
            )}
          </div>

          {/* 수급 데이터 */}
          {investor && (
            <div className="mt-2 flex items-center gap-3 text-[10px]">
              <span className="text-gray-400">
                기관 <span className={`font-semibold ${investor.inst > 0 ? 'text-red-500' : investor.inst < 0 ? 'text-blue-500' : 'text-gray-400'}`}>
                  {formatInvestor(investor.inst)}
                </span>
              </span>
              <span className="text-gray-400">
                외국인 <span className={`font-semibold ${investor.frgn > 0 ? 'text-red-500' : investor.frgn < 0 ? 'text-blue-500' : 'text-gray-400'}`}>
                  {formatInvestor(investor.frgn)}
                </span>
              </span>
              <span className="text-gray-400">
                개인 <span className={`font-semibold ${investor.prsn > 0 ? 'text-red-500' : investor.prsn < 0 ? 'text-blue-500' : 'text-gray-400'}`}>
                  {formatInvestor(investor.prsn)}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* MA 수치 표시 */}
        {(activeOverlays.has('ma5') || activeOverlays.has('ma20') || activeOverlays.has('ma50')) && (
          <div className="px-5 py-3 border-t border-gray-50 flex items-center gap-4 text-xs text-gray-500">
            {activeOverlays.has('ma5') && displayMA.ma5 > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                MA5: {displayMA.ma5.toFixed(1)}
              </span>
            )}
            {activeOverlays.has('ma20') && displayMA.ma20 > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-violet-500 inline-block" />
                MA20: {displayMA.ma20.toFixed(1)}
              </span>
            )}
            {activeOverlays.has('ma50') && displayMA.ma50 > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
                MA50: {displayMA.ma50.toFixed(1)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MarketIndex({ aside }: { aside?: React.ReactNode } = {}) {
  const [data, setData] = useState<MarketData | null>(null);
  const [error, setError] = useState(false);
  const isMounted = useRef(true);
  const dataRef = useRef<MarketData | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/market?period=daily');
      if (!res.ok) {
        if (isMounted.current && !dataRef.current) setError(true);
        return;
      }
      const result = await res.json();
      if (result.error) {
        if (isMounted.current && !dataRef.current) setError(true);
        return;
      }
      if (isMounted.current) {
        dataRef.current = result;
        setData(result);
        setError(false);
      }
    } catch {
      if (isMounted.current && !dataRef.current) setError(true);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchData();
    const interval = setInterval(fetchData, 60 * 1000); // 1분 갱신
    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [fetchData]);

  if (!data && !error) {
    return (
      <section className="pt-4 pb-2 px-6">
        <div className={`max-w-7xl mx-auto grid gap-4 ${aside ? 'grid-cols-1 md:grid-cols-[1fr_1fr_180px]' : 'grid-cols-1 md:grid-cols-2'}`}>
          {[0, 1].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 animate-pulse">
              <div className="h-4 w-20 bg-gray-200 rounded mb-2" />
              <div className="h-8 w-36 bg-gray-200 rounded mb-3" />
              <div className="h-40 bg-gray-100 rounded" />
            </div>
          ))}
          {aside}
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="pt-4 pb-2 px-6">
        <div className={`max-w-7xl mx-auto grid gap-4 ${aside ? 'grid-cols-1 md:grid-cols-[1fr_1fr_180px]' : 'grid-cols-1 md:grid-cols-2'}`}>
          {[0, 1].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 text-center">
              <p className="text-sm text-gray-400">지수 데이터를 불러오지 못했습니다</p>
            </div>
          ))}
          {aside}
        </div>
      </section>
    );
  }

  return (
    <section className="pt-4 pb-2 px-6">
      <div className={`max-w-7xl mx-auto grid gap-4 ${aside ? 'grid-cols-1 md:grid-cols-[1fr_1fr_180px]' : 'grid-cols-1 md:grid-cols-2'}`}>
        <IndexCard data={data.kospi} investor={data.kospi.investor} />
        <IndexCard data={data.kosdaq} investor={data.kosdaq.investor} />
        {aside}
      </div>
    </section>
  );
}
