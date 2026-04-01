'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChartCandle } from '../types/stock';

interface StockChartProps {
  stockCode: string;
  stockName: string;
  onClose: () => void;
}

type PeriodKey = 'daily' | 'weekly' | 'monthly';

const PERIOD_LABELS: { key: PeriodKey; label: string }[] = [
  { key: 'daily', label: '일봉' },
  { key: 'weekly', label: '주봉' },
  { key: 'monthly', label: '월봉' },
];

interface StockInfo {
  stck_prpr: string;     // 현재가
  prdy_vrss: string;     // 전일대비
  prdy_ctrt: string;     // 전일대비율
  acml_vol: string;      // 누적거래량
  acml_tr_pbmn: string;  // 누적거래대금
  stck_oprc: string;     // 시가
  stck_hgpr: string;     // 고가
  stck_lwpr: string;     // 저가
  hts_avls: string;      // 시가총액(억)
  per: string;           // PER
  pbr: string;           // PBR
  eps: string;           // EPS
  bps: string;           // BPS
  lstn_stcn: string;     // 상장주수
  cpfn: string;          // 자본금
  w52_hgpr: string;      // 52주 최고가
  w52_lwpr: string;      // 52주 최저가
}

/** 숫자 포맷: 억 단위 */
function formatBillion(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}조`;
  return `${v.toLocaleString()}억`;
}

/** 숫자 포맷: 원 */
function formatKRW(v: number): string {
  return v.toLocaleString('ko-KR');
}

/** 날짜 포맷 */
function formatDate(dateStr: string): string {
  if (dateStr.length === 8) {
    const m = dateStr.slice(4, 6);
    const d = dateStr.slice(6, 8);
    return `${Number(m)}/${Number(d)}`;
  }
  return dateStr;
}

/** 가격 포맷 (Y축) */
function formatPrice(v: number): string {
  if (v >= 100000) return `${(v / 10000).toFixed(0)}만`;
  if (v >= 10000) return `${(v / 10000).toFixed(1)}만`;
  return v.toLocaleString();
}

export default function StockChart({ stockCode, stockName, onClose }: StockChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [candles, setCandles] = useState<ChartCandle[]>([]);
  const [info, setInfo] = useState<StockInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('daily');
  const [width, setWidth] = useState(600);

  // 반응형 너비
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  // 데이터 fetching
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/kis/chart?code=${stockCode}&period=${period}&info=1`);
      if (!res.ok) throw new Error('차트 데이터를 불러올 수 없습니다');
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setCandles(data.candles || data || []);
        if (data.info) setInfo(data.info);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }, [stockCode, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ESC로 닫기
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // 현재가 정보
  const currentPrice = info ? Number(info.stck_prpr) : 0;
  const change = info ? Number(info.prdy_vrss) : 0;
  const changeRate = info ? Number(info.prdy_ctrt) : 0;
  const isUp = change >= 0;

  // SVG 캔들차트
  const chartHeight = 280;
  const renderChart = () => {
    if (candles.length < 2) return null;

    const padding = { top: 12, bottom: 28, left: 4, right: 56 };
    const chartW = width - padding.left - padding.right;
    const chartH = chartHeight - padding.top - padding.bottom;

    let allMin = Infinity;
    let allMax = -Infinity;
    for (const d of candles) {
      if (d.low < allMin) allMin = d.low;
      if (d.high > allMax) allMax = d.high;
    }
    const range = allMax - allMin || 1;

    const candleW = Math.max(1, (chartW / candles.length) * 0.6);
    const gap = chartW / candles.length;

    const toY = (v: number) => padding.top + chartH - ((v - allMin) / range) * chartH;
    const toX = (i: number) => padding.left + gap * i + gap / 2;

    const yTicks = 5;
    const yTickValues: number[] = [];
    for (let i = 0; i < yTicks; i++) {
      yTickValues.push(allMin + (range * i) / (yTicks - 1));
    }

    const xLabelCount = Math.min(6, candles.length);
    const xLabelIndices: number[] = [];
    for (let i = 0; i < xLabelCount; i++) {
      xLabelIndices.push(Math.round((i * (candles.length - 1)) / (xLabelCount - 1)));
    }

    return (
      <svg width={width} height={chartHeight} className="block">
        {yTickValues.map((v, i) => (
          <line
            key={`yg-${i}`}
            x1={padding.left} y1={toY(v)}
            x2={padding.left + chartW} y2={toY(v)}
            stroke="#f0f0f0" strokeWidth={0.8} strokeDasharray="3,3"
          />
        ))}

        {candles.map((d, i) => {
          const up = d.close >= d.open;
          const color = up ? '#ef4444' : '#3b82f6';
          const x = toX(i);
          const bodyTop = toY(Math.max(d.open, d.close));
          const bodyBottom = toY(Math.min(d.open, d.close));
          const bodyH = Math.max(0.5, bodyBottom - bodyTop);

          return (
            <g key={i}>
              <line x1={x} y1={toY(d.high)} x2={x} y2={toY(d.low)} stroke={color} strokeWidth={0.8} />
              <rect x={x - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} stroke={color} strokeWidth={0.3} />
            </g>
          );
        })}

        {yTickValues.map((v, i) => (
          <text key={`yt-${i}`} x={padding.left + chartW + 6} y={toY(v) + 3} fontSize={9} fill="#a3a3a3" textAnchor="start">
            {formatPrice(v)}
          </text>
        ))}

        {xLabelIndices.map((idx) => (
          <text key={`xl-${idx}`} x={toX(idx)} y={chartHeight - 4} fontSize={9} fill="#a3a3a3" textAnchor="middle">
            {formatDate(candles[idx].date)}
          </text>
        ))}
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold">{stockName}</h3>
              <span className="text-xs text-gray-400">{stockCode}</span>
            </div>
            {info && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-2xl font-bold">{formatKRW(currentPrice)}</span>
                <span className={`text-sm font-medium ${isUp ? 'text-red-500' : 'text-blue-500'}`}>
                  {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{formatKRW(change)} ({isUp ? '+' : ''}{changeRate.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-black text-xl leading-none p-2"
          >
            ×
          </button>
        </div>

        {/* Period Selection */}
        <div className="flex items-center gap-2 px-6 pt-4">
          {PERIOD_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                period === key
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="px-4 pt-2 pb-4" ref={containerRef}>
          {loading && (
            <div className="flex items-center justify-center text-gray-400" style={{ height: chartHeight }}>
              <span className="animate-pulse">차트 데이터 로딩 중...</span>
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center text-gray-400" style={{ height: chartHeight }}>
              <p className="mb-2">{error}</p>
            </div>
          )}
          {!loading && !error && candles.length > 0 && renderChart()}
          {!loading && !error && candles.length === 0 && (
            <div className="flex items-center justify-center text-gray-400" style={{ height: chartHeight }}>
              데이터가 없습니다
            </div>
          )}
        </div>

        {/* Company Info */}
        {info && (
          <div className="px-6 pb-5 border-t border-gray-100 pt-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
              <InfoItem label="시가총액" value={formatBillion(Number(info.hts_avls) || 0)} />
              <InfoItem label="상장주수" value={`${formatKRW(Number(info.lstn_stcn) || 0)}주`} />
              <InfoItem label="PER" value={Number(info.per) ? `${Number(info.per).toFixed(2)}배` : '-'} />
              <InfoItem label="PBR" value={Number(info.pbr) ? `${Number(info.pbr).toFixed(2)}배` : '-'} />
              <InfoItem label="EPS" value={Number(info.eps) ? `${formatKRW(Number(info.eps))}원` : '-'} />
              <InfoItem label="BPS" value={Number(info.bps) ? `${formatKRW(Number(info.bps))}원` : '-'} />
              <InfoItem label="52주 최고" value={Number(info.w52_hgpr) ? `${formatKRW(Number(info.w52_hgpr))}원` : '-'} highlight="red" />
              <InfoItem label="52주 최저" value={Number(info.w52_lwpr) ? `${formatKRW(Number(info.w52_lwpr))}원` : '-'} highlight="blue" />
              <InfoItem label="시가" value={`${formatKRW(Number(info.stck_oprc))}원`} />
              <InfoItem label="고가" value={`${formatKRW(Number(info.stck_hgpr))}원`} highlight="red" />
              <InfoItem label="저가" value={`${formatKRW(Number(info.stck_lwpr))}원`} highlight="blue" />
              <InfoItem label="거래량" value={formatKRW(Number(info.acml_vol))} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoItem({ label, value, highlight }: { label: string; value: string; highlight?: 'red' | 'blue' }) {
  const valueColor = highlight === 'red' ? 'text-red-500' : highlight === 'blue' ? 'text-blue-500' : 'text-gray-900';
  return (
    <div>
      <span className="text-xs text-gray-400">{label}</span>
      <p className={`font-medium ${valueColor}`}>{value}</p>
    </div>
  );
}
