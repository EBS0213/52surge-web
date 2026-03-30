'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChartCandle } from '../types/stock';

interface StockChartProps {
  stockCode: string;
  stockName: string;
  onClose: () => void;
}

export default function StockChart({ stockCode, stockName, onClose }: StockChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [candles, setCandles] = useState<ChartCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(90);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/kis/chart?code=${stockCode}&days=${period}`)
      .then((res) => {
        if (!res.ok) throw new Error('차트 데이터를 불러올 수 없습니다');
        return res.json();
      })
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setCandles(data);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [stockCode, period]);

  // 캔버스 차트 렌더링
  useEffect(() => {
    if (!canvasRef.current || candles.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 20, right: 60, bottom: 30, left: 10 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // 데이터 범위
    const prices = candles.flatMap((c) => [c.high, c.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const candleWidth = Math.max(1, (chartW / candles.length) * 0.7);
    const gap = chartW / candles.length;

    // 배경
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // 그리드
    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();

      // 가격 레이블
      const price = maxPrice - (priceRange / gridLines) * i;
      ctx.fillStyle = '#9ca3af';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(price.toLocaleString(), width - padding.right + 5, y + 4);
    }

    // 캔들 그리기
    candles.forEach((candle, i) => {
      const x = padding.left + gap * i + gap / 2;
      const isUp = candle.close >= candle.open;
      const color = isUp ? '#ef4444' : '#3b82f6';

      const openY = padding.top + ((maxPrice - candle.open) / priceRange) * chartH;
      const closeY = padding.top + ((maxPrice - candle.close) / priceRange) * chartH;
      const highY = padding.top + ((maxPrice - candle.high) / priceRange) * chartH;
      const lowY = padding.top + ((maxPrice - candle.low) / priceRange) * chartH;

      // 꼬리 (위아래)
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      // 몸통
      ctx.fillStyle = isUp ? color : color;
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));
      ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
    });

    // 날짜 레이블 (시작, 중간, 끝)
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    const dateIndices = [0, Math.floor(candles.length / 2), candles.length - 1];
    dateIndices.forEach((idx) => {
      if (candles[idx]) {
        const x = padding.left + gap * idx + gap / 2;
        const d = candles[idx].date;
        const label = `${d.slice(4, 6)}/${d.slice(6, 8)}`;
        ctx.fillText(label, x, height - 8);
      }
    });
  }, [candles]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold">{stockName}</h3>
            <p className="text-xs text-gray-400">{stockCode}</p>
          </div>
          <div className="flex items-center gap-3">
            {[30, 90, 180].map((d) => (
              <button
                key={d}
                onClick={() => setPeriod(d)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  period === d
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {d}일
              </button>
            ))}
            <button
              onClick={onClose}
              className="ml-2 text-gray-400 hover:text-black text-xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="p-6">
          {loading && (
            <div className="h-64 flex items-center justify-center text-gray-400">
              차트 데이터 로딩 중...
            </div>
          )}
          {error && (
            <div className="h-64 flex flex-col items-center justify-center text-gray-400">
              <p className="mb-2">{error}</p>
              <p className="text-xs">
                한투 OpenAPI 키를 .env.local에 설정하면 차트를 볼 수 있습니다
              </p>
            </div>
          )}
          {!loading && !error && candles.length > 0 && (
            <canvas
              ref={canvasRef}
              className="w-full h-64"
              style={{ width: '100%', height: '256px' }}
            />
          )}
          {!loading && !error && candles.length === 0 && (
            <div className="h-64 flex items-center justify-center text-gray-400">
              데이터가 없습니다
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
