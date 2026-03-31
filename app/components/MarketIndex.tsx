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

type PeriodKey = 'daily' | 'weekly' | 'monthly' | '1d' | '3m' | '1y' | '3y' | '5y';

// 캔들스틱 차트 (MA 시각화): 일봉, 주봉, 월봉
// 선형 차트 (MA 비표시): 1일, 3개월, 1년, 3년, 5년
const CANDLE_PERIODS: PeriodKey[] = ['daily', 'weekly', 'monthly'];
const LINE_PERIODS: PeriodKey[] = ['1d', '3m', '1y', '3y', '5y'];

const PERIOD_LABELS: { key: PeriodKey; label: string }[] = [
  { key: 'daily', label: '일봉' },
  { key: 'weekly', label: '주봉' },
  { key: 'monthly', label: '월봉' },
  { key: '1d', label: '1일' },
  { key: '3m', label: '3개월' },
  { key: '1y', label: '1년' },
  { key: '3y', label: '3년' },
  { key: '5y', label: '5년' },
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

function isCandlePeriod(period: PeriodKey): boolean {
  return CANDLE_PERIODS.includes(period);
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

/** SVG 캔들차트 + 이동평균선 + Y축 수치 + X축 날짜 */
function CandleChart({ data, height }: { data: CandleData[]; height: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useChartSize(containerRef);

  if (data.length < 3) return <div ref={containerRef} className="w-full" />;

  const ma5 = calcMA(data, 5);
  const ma10 = calcMA(data, 10);
  const ma20 = calcMA(data, 20);

  const padding = { top: 8, bottom: 28, left: 4, right: 52 };
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

  const yTicks = 5;
  const yTickValues: number[] = [];
  for (let i = 0; i < yTicks; i++) {
    yTickValues.push(allMin + (range * i) / (yTicks - 1));
  }

  const xLabelCount = Math.min(6, data.length);
  const xLabelIndices: number[] = [];
  for (let i = 0; i < xLabelCount; i++) {
    xLabelIndices.push(Math.round((i * (data.length - 1)) / (xLabelCount - 1)));
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

      {/* 이동평균선 */}
      <path d={maLine(ma5)} fill="none" stroke="#f59e0b" strokeWidth={1.2} strokeLinejoin="round" opacity={0.9} />
      <path d={maLine(ma10)} fill="none" stroke="#8b5cf6" strokeWidth={1.2} strokeLinejoin="round" opacity={0.9} />
      <path d={maLine(ma20)} fill="none" stroke="#06b6d4" strokeWidth={1.2} strokeLinejoin="round" opacity={0.9} />

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
          {formatDateLabel(data[idx].date)}
        </text>
      ))}

      {/* MA 범례 */}
      <g transform={`translate(${padding.left + 4}, ${height - padding.bottom - 4})`}>
        <circle cx={0} cy={-3} r={3} fill="#f59e0b" />
        <text x={6} y={0} fontSize={8} fill="#a3a3a3">5</text>
        <circle cx={24} cy={-3} r={3} fill="#8b5cf6" />
        <text x={30} y={0} fontSize={8} fill="#a3a3a3">10</text>
        <circle cx={52} cy={-3} r={3} fill="#06b6d4" />
        <text x={58} y={0} fontSize={8} fill="#a3a3a3">20</text>
      </g>
    </svg>
    </div>
  );
}

/** 인트라데이 데이터인지 판별 (date가 HHMM 형식) */
function isIntradayData(data: CandleData[]): boolean {
  if (data.length === 0) return false;
  return data[0].date.length <= 6 && /^\d{4,6}$/.test(data[0].date);
}

/** 인트라데이 X축: 정각(00분) 라벨만 표시, 해당 데이터 인덱스 반환 */
function getIntradayHourIndices(data: CandleData[]): { idx: number; label: string }[] {
  const result: { idx: number; label: string }[] = [];
  for (let i = 0; i < data.length; i++) {
    const d = data[i].date;
    const mm = d.slice(2, 4);
    if (mm === '00') {
      const hh = d.slice(0, 2);
      result.push({ idx: i, label: `${hh}:00` });
    }
  }
  return result;
}

/** SVG 선형 차트 (MA 비표시) */
function LineChart({ data, height }: { data: CandleData[]; height: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useChartSize(containerRef);

  if (data.length < 2) return <div ref={containerRef} className="w-full" />;

  const padding = { top: 8, bottom: 28, left: 4, right: 52 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  let allMin = Infinity;
  let allMax = -Infinity;
  for (const d of data) {
    if (d.close < allMin) allMin = d.close;
    if (d.close > allMax) allMax = d.close;
  }
  // 약간의 여유
  const rangePad = (allMax - allMin) * 0.05 || 1;
  allMin -= rangePad;
  allMax += rangePad;
  const range = allMax - allMin || 1;

  const gap = chartW / (data.length - 1);
  const toY = (v: number) => padding.top + chartH - ((v - allMin) / range) * chartH;
  const toX = (i: number) => padding.left + gap * i;

  // 선형 path
  let linePath = '';
  let areaPath = '';
  for (let i = 0; i < data.length; i++) {
    const x = toX(i);
    const y = toY(data[i].close);
    if (i === 0) {
      linePath = `M${x},${y}`;
      areaPath = `M${x},${padding.top + chartH} L${x},${y}`;
    } else {
      linePath += ` L${x},${y}`;
      areaPath += ` L${x},${y}`;
    }
  }
  // 영역 닫기
  areaPath += ` L${toX(data.length - 1)},${padding.top + chartH} Z`;

  // 상승/하락 색상
  const firstClose = data[0].close;
  const lastClose = data[data.length - 1].close;
  const isUp = lastClose >= firstClose;
  const lineColor = isUp ? '#ef4444' : '#3b82f6';
  const areaColor = isUp ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)';

  // Y축 눈금
  const yTicks = 5;
  const yTickValues: number[] = [];
  for (let i = 0; i < yTicks; i++) {
    yTickValues.push(allMin + (range * i) / (yTicks - 1));
  }

  // X축 라벨: 인트라데이면 정각 시간만, 아니면 등간격
  const intraday = isIntradayData(data);
  const hourLabels = intraday ? getIntradayHourIndices(data) : [];

  const xLabelCount = Math.min(6, data.length);
  const xLabelIndices: number[] = [];
  if (!intraday) {
    for (let i = 0; i < xLabelCount; i++) {
      xLabelIndices.push(Math.round((i * (data.length - 1)) / (xLabelCount - 1)));
    }
  }

  return (
    <div ref={containerRef} className="w-full">
    <svg width={width} height={height} className="block">
      {/* Y축 가이드라인 */}
      {yTickValues.map((v, i) => (
        <line
          key={`yg-${i}`}
          x1={padding.left} y1={toY(v)}
          x2={padding.left + chartW} y2={toY(v)}
          stroke="#f0f0f0" strokeWidth={0.8} strokeDasharray="3,3"
        />
      ))}

      {/* 인트라데이: 정각 시간에 세로 가이드라인 */}
      {intraday && hourLabels.map(({ idx }, i) => (
        <line
          key={`xg-${i}`}
          x1={toX(idx)} y1={padding.top}
          x2={toX(idx)} y2={padding.top + chartH}
          stroke="#f0f0f0" strokeWidth={0.8} strokeDasharray="3,3"
        />
      ))}

      {/* 영역 채우기 */}
      <path d={areaPath} fill={areaColor} />

      {/* 선 */}
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinejoin="round" />

      {/* Y축 가격 */}
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

      {/* X축: 인트라데이 → 정각 시간 라벨, 기타 → 등간격 날짜 */}
      {intraday
        ? hourLabels.map(({ idx, label }, i) => (
            <text
              key={`xl-${i}`}
              x={toX(idx)}
              y={height - 4}
              fontSize={9}
              fill="#a3a3a3"
              textAnchor="middle"
            >
              {label}
            </text>
          ))
        : xLabelIndices.map((idx) => (
            <text
              key={`xl-${idx}`}
              x={toX(idx)}
              y={height - 4}
              fontSize={9}
              fill="#a3a3a3"
              textAnchor="middle"
            >
              {formatDateLabel(data[idx].date)}
            </text>
          ))
      }
    </svg>
    </div>
  );
}

/** 수급 표시 포맷: 억원 */
function formatInvestor(v: number): string {
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toLocaleString()}`;
}

/** 단일 지수 카드 */
const defaultPeriod: PeriodKey = '1d';

function IndexCard({ data, investor }: { data: IndexData; investor?: InvestorData | null }) {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>(defaultPeriod);
  const [periodChartData, setPeriodChartData] = useState<IndexData | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const isUp = data.change >= 0;
  const arrow = isUp ? '▲' : '▼';
  const sign = isUp ? '+' : '';

  const chartData = data.chart;
  const { state, ma5, ma10, ma20 } = getMarketState(data.chart);
  const sc = stateColor(state);

  const displayChart = periodChartData ? periodChartData.chart : chartData;
  const displayMA = periodChartData ? getMarketState(periodChartData.chart) : { ma5, ma10, ma20 };
  const showCandle = isCandlePeriod(selectedPeriod);

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
        {showCandle ? (
          <CandleChart data={displayChart} height={220} />
        ) : (
          <LineChart data={displayChart} height={220} />
        )}
      </div>

      {/* 기간 선택 + 수급 */}
      <div className="border-t border-gray-100">
        <div className="px-5 py-3">
          {/* 캔들스틱 그룹 + 선형 그룹 */}
          <div className="flex items-center gap-1 flex-wrap">
            {PERIOD_LABELS.filter(p => CANDLE_PERIODS.includes(p.key)).map(({ key, label }) => (
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
            {PERIOD_LABELS.filter(p => LINE_PERIODS.includes(p.key)).map(({ key, label }) => (
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

        {/* MA 정보: 캔들스틱 차트에만 표시 */}
        {showCandle && (
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
        )}
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
      const res = await fetch('/api/market?period=1d');
      if (!res.ok) {
        if (isMounted.current && !data) setError(true);
        return;
      }
      const result = await res.json();
      if (result.error) {
        if (isMounted.current && !data) setError(true);
        return;
      }
      if (isMounted.current) {
        setData(result);
        setError(false);
      }
    } catch {
      if (isMounted.current && !data) setError(true);
    }
  }, [data]);

  useEffect(() => {
    isMounted.current = true;
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [fetchData]);

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
        <IndexCard data={data.kospi} investor={data.kospi.investor} />
        <IndexCard data={data.kosdaq} investor={data.kosdaq.investor} />
      </div>
    </section>
  );
}
