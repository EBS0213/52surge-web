'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../components/Navbar';

interface SectorStock {
  code: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  marketCap: number;
}

interface SectorRS {
  code: string;
  name: string;
  currentIndex: number;
  change: number;
  changeRate: number;
  periodReturn: number;
  rs: number;
  rsRank: number;
}

interface RSData {
  period: number;
  benchmark: {
    name: string;
    periodReturn: number;
    currentIndex: number;
  };
  sectors: SectorRS[];
  updatedAt: string;
}

const PERIODS = [
  { value: 5, label: '5일' },
  { value: 10, label: '10일' },
  { value: 20, label: '20일' },
  { value: 60, label: '60일' },
  { value: 120, label: '120일' },
];

// ── 업종 카드 컴포넌트 ──────────────────────────────────────────
function SectorCard({ sector }: { sector: SectorRS }) {
  const [stocks, setStocks] = useState<SectorStock[]>([]);
  const [loading, setLoading] = useState(true);
  // expanded 불필요 — 스크롤로 대체

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/kis/sector-stocks?code=${sector.code}`);
        if (!res.ok) throw new Error('fail');
        const data = await res.json();
        if (!cancelled) setStocks(data.stocks || []);
      } catch {
        if (!cancelled) setStocks([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sector.code]);

  const upCount = stocks.filter((s) => s.changeRate > 0).length;
  const downCount = stocks.filter((s) => s.changeRate < 0).length;
  const totalCount = stocks.length;
  const topStocks = stocks;

  const returnColor = sector.periodReturn > 0 ? 'text-red-500' : sector.periodReturn < 0 ? 'text-blue-500' : 'text-gray-500';

  // RS 배지
  const rsBg =
    sector.rs >= 70 ? 'bg-green-100 text-green-700 border-green-200'
    : sector.rs >= 50 ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
    : sector.rs >= 30 ? 'bg-gray-100 text-gray-600 border-gray-200'
    : sector.rs >= 15 ? 'bg-orange-50 text-orange-700 border-orange-200'
    : 'bg-red-100 text-red-700 border-red-200';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      {/* 헤더 */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-gray-900 truncate">{sector.name}</h3>
            <div className={`text-lg font-bold mt-0.5 ${returnColor}`}>
              {sector.periodReturn > 0 ? '+' : ''}{sector.periodReturn.toFixed(2)}%
            </div>
          </div>
          <span className={`text-xs font-mono px-2 py-0.5 rounded-full border flex-shrink-0 ml-3 ${rsBg}`}>
            RS {sector.rs.toFixed(0)}
          </span>
        </div>

        {/* 상승/하락/전체 */}
        {!loading && totalCount > 0 && (
          <div className="flex items-center gap-3 mt-2.5 text-xs">
            <span className="text-red-500">▲ 상승 {upCount}개</span>
            <span className="text-blue-500">▼ 하락 {downCount}개</span>
            <span className="text-gray-400 ml-auto">전체 {totalCount}</span>
          </div>
        )}
      </div>

      {/* 구분선 */}
      <div className="border-t border-gray-100" />

      {/* 종목 리스트 (스크롤) */}
      <div className="px-5 py-2 flex-1 max-h-72 overflow-y-auto">
        {loading ? (
          <div className="space-y-2.5 py-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-6 bg-gray-50 rounded animate-pulse" />
            ))}
          </div>
        ) : stocks.length === 0 ? (
          <div className="py-6 text-center text-xs text-gray-400">데이터 없음</div>
        ) : (
          <div>
            {topStocks.map((stock, idx) => {
              const sColor = stock.changeRate > 0 ? 'text-red-500' : stock.changeRate < 0 ? 'text-blue-500' : 'text-gray-400';
              return (
                <div
                  key={stock.code}
                  className="flex items-center py-2 gap-3"
                >
                  <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0">{idx + 1}</span>
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-gray-500">
                      {stock.name.charAt(0)}
                    </span>
                  </div>
                  <span className="text-sm text-gray-900 truncate flex-1">{stock.name}</span>
                  <span className={`text-sm font-mono font-medium flex-shrink-0 ${sColor}`}>
                    {stock.changeRate > 0 ? '+' : ''}{stock.changeRate.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

// ── 메인 페이지 ─────────────────────────────────────────────────
export default function HybridPage() {
  const [data, setData] = useState<RSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(20);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchRS = useCallback(async (p: number, showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/kis/sector-rs?period=${p}`);
      if (!res.ok) throw new Error(`API 오류: ${res.status}`);
      const result: RSData = await res.json();
      setData(result);
      setLastUpdated(new Date(result.updatedAt));
    } catch (err) {
      setError(err instanceof Error ? err.message : '데이터 로딩 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRS(period);
  }, [period, fetchRS]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar lastUpdated={lastUpdated} onRefresh={() => fetchRS(period, false)} />

      <main className="pt-16 px-6 pb-16">
        <div className="max-w-7xl mx-auto">
          {/* 헤더 */}
          <div className="flex items-end justify-between mb-4 mt-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">산업별 RS</h1>
              <p className="text-sm text-gray-500 mt-1">
                업종별 Relative Strength — 70 이상 강세 | 30 이하 약세
              </p>
            </div>
          </div>

          {/* 기간 선택 탭 + 벤치마크 */}
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <div className="flex gap-1.5">
              {PERIODS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setPeriod(value)}
                  className={`px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    period === value
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {data && (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-400">{data.benchmark.name}</span>
                <span className="font-mono font-medium">
                  {data.benchmark.currentIndex.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
                </span>
                <span className={`font-mono font-medium ${
                  data.benchmark.periodReturn > 0 ? 'text-red-500' : data.benchmark.periodReturn < 0 ? 'text-blue-500' : 'text-gray-500'
                }`}>
                  {data.benchmark.periodReturn > 0 ? '+' : ''}{data.benchmark.periodReturn.toFixed(2)}%
                </span>
              </div>
            )}
          </div>

          {/* 로딩 */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(9)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 h-72 animate-pulse">
                  <div className="h-5 bg-gray-100 rounded w-24 mb-3" />
                  <div className="h-7 bg-gray-100 rounded w-16 mb-4" />
                  <div className="space-y-3 mt-6">
                    {[...Array(5)].map((_, j) => (
                      <div key={j} className="h-5 bg-gray-50 rounded" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 에러 */}
          {!loading && error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-6 text-center text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* 카드 그리드 */}
          {!loading && data && data.sectors.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.sectors.map((sector) => (
                <SectorCard key={sector.code} sector={sector} />
              ))}
            </div>
          )}

          {!loading && data && data.sectors.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 text-sm">
              업종 데이터를 불러올 수 없습니다.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
