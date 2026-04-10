'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../components/Navbar';

/* ── 타입 ─────────────────────────────────────────────────────── */

interface ThemeRS {
  code: string;
  name: string;
  stockCount: number;
  avgChangeRate: number;
  upCount: number;
  downCount: number;
  rs: number;
  rsRank: number;
  loaded: number;
}

interface ThemeRSData {
  themes: ThemeRS[];
  updatedAt: string;
  progress: number;
  totalStocks: number;
  loadedStocks: number;
}

interface ThemeStock {
  code: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  marketCap: number;
}

/* ── RS 배지 색상 ─────────────────────────────────────────────── */

function rsBadgeClass(rs: number) {
  if (rs >= 70) return 'bg-green-100 text-green-700 border-green-200';
  if (rs >= 50) return 'bg-yellow-50 text-yellow-700 border-yellow-200';
  if (rs >= 30) return 'bg-gray-100 text-gray-600 border-gray-200';
  if (rs >= 15) return 'bg-orange-50 text-orange-700 border-orange-200';
  return 'bg-red-100 text-red-700 border-red-200';
}

/* ── 테마 카드 컴포넌트 ──────────────────────────────────────── */

function ThemeCard({ theme }: { theme: ThemeRS }) {
  const [expanded, setExpanded] = useState(false);
  const [stocks, setStocks] = useState<ThemeStock[]>([]);
  const [stocksLoading, setStocksLoading] = useState(false);

  const fetchStocks = useCallback(async () => {
    if (stocks.length > 0) return; // 이미 로드됨
    setStocksLoading(true);
    try {
      const res = await fetch(`/api/kis/theme-stocks?code=${theme.code}`);
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      setStocks(data.stocks || []);
    } catch {
      setStocks([]);
    } finally {
      setStocksLoading(false);
    }
  }, [theme.code, stocks.length]);

  const handleToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) fetchStocks();
  };

  const rateColor =
    theme.avgChangeRate > 0 ? 'text-red-500' :
    theme.avgChangeRate < 0 ? 'text-blue-500' : 'text-gray-500';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
      {/* 헤더 (클릭 가능) */}
      <button
        onClick={handleToggle}
        className="w-full text-left px-5 pt-4 pb-3 hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-gray-900 truncate">
              {theme.name}
            </h3>
            <div className={`text-lg font-bold mt-0.5 ${rateColor}`}>
              {theme.avgChangeRate > 0 ? '+' : ''}
              {theme.avgChangeRate.toFixed(2)}%
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 ml-3 flex-shrink-0">
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded-full border ${rsBadgeClass(theme.rs)}`}
            >
              RS {theme.rs}
            </span>
            <span className="text-[10px] text-gray-400">
              {theme.stockCount}종목
            </span>
          </div>
        </div>

        {/* 상승/하락 바 */}
        {theme.loaded > 0 && (
          <div className="flex items-center gap-3 mt-2 text-xs">
            <span className="text-red-500">▲ {theme.upCount}</span>
            <span className="text-blue-500">▼ {theme.downCount}</span>
            {theme.loaded < theme.stockCount && (
              <span className="text-gray-300 ml-auto">
                {theme.loaded}/{theme.stockCount} 로드
              </span>
            )}
            <span
              className={`ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`}
            >
              ▾
            </span>
          </div>
        )}
      </button>

      {/* 종목 리스트 (확장 시) */}
      {expanded && (
        <>
          <div className="border-t border-gray-100" />
          <div className="px-5 py-2 max-h-72 overflow-y-auto">
            {stocksLoading ? (
              <div className="space-y-2.5 py-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-6 bg-gray-50 rounded animate-pulse" />
                ))}
              </div>
            ) : stocks.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-400">
                데이터 로딩 중...
              </div>
            ) : (
              <div>
                {stocks.map((stock, idx) => {
                  const sColor =
                    stock.changeRate > 0 ? 'text-red-500' :
                    stock.changeRate < 0 ? 'text-blue-500' : 'text-gray-400';
                  return (
                    <div key={stock.code} className="flex items-center py-2 gap-3">
                      <span className="text-xs text-gray-400 w-5 text-right flex-shrink-0">
                        {idx + 1}
                      </span>
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-gray-500">
                          {stock.name.charAt(0)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-900 truncate block">
                          {stock.name}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-mono text-gray-700">
                          {stock.price.toLocaleString()}
                        </div>
                        <div className={`text-xs font-mono ${sColor}`}>
                          {stock.changeRate > 0 ? '+' : ''}
                          {stock.changeRate.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── 검색 & 정렬 ─────────────────────────────────────────────── */

type SortKey = 'rs' | 'rate' | 'name';

/* ── 메인 페이지 ─────────────────────────────────────────────── */

export default function HybridPage() {
  const [data, setData] = useState<ThemeRSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('rs');

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/kis/theme-rs');
      if (!res.ok) throw new Error(`API 오류: ${res.status}`);
      const result: ThemeRSData = await res.json();
      setData(result);
      setLastUpdated(new Date(result.updatedAt));
    } catch (err) {
      setError(err instanceof Error ? err.message : '데이터 로딩 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 필터 & 정렬
  const filtered = data?.themes
    .filter((t) =>
      !search || t.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'rs') return b.rs - a.rs || b.avgChangeRate - a.avgChangeRate;
      if (sortBy === 'rate') return b.avgChangeRate - a.avgChangeRate;
      return a.name.localeCompare(b.name, 'ko');
    }) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar lastUpdated={lastUpdated} onRefresh={() => fetchData(false)} />

      <main className="pt-16 px-6 pb-16">
        <div className="max-w-7xl mx-auto">
          {/* 헤더 */}
          <div className="mt-4 mb-4">
            <h1 className="text-2xl font-bold text-gray-900">테마별 RS</h1>
            <p className="text-sm text-gray-500 mt-1">
              {data
                ? `${data.themes.length}개 테마 · RS 70↑ 강세 | 30↓ 약세`
                : '테마별 Relative Strength'}
              {data && data.progress < 100 && (
                <span className="ml-2 text-amber-500">
                  · 데이터 수집 중 {data.progress}%
                </span>
              )}
            </p>
          </div>

          {/* 검색 + 정렬 */}
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            <input
              type="text"
              placeholder="테마 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-4 py-2 text-sm border border-gray-200 rounded-full bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 w-60"
            />
            <div className="flex gap-1.5">
              {([
                { key: 'rs' as SortKey, label: 'RS순' },
                { key: 'rate' as SortKey, label: '등락률순' },
                { key: 'name' as SortKey, label: '이름순' },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortBy(key)}
                  className={`px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    sortBy === key
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 로딩 스켈레톤 */}
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-gray-100 p-6 h-32 animate-pulse"
                >
                  <div className="h-5 bg-gray-100 rounded w-32 mb-3" />
                  <div className="h-7 bg-gray-100 rounded w-16 mb-3" />
                  <div className="flex gap-4">
                    <div className="h-4 bg-gray-50 rounded w-12" />
                    <div className="h-4 bg-gray-50 rounded w-12" />
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
          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((theme) => (
                <ThemeCard key={theme.code} theme={theme} />
              ))}
            </div>
          )}

          {!loading && data && filtered.length === 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center text-gray-400 text-sm">
              {search ? `"${search}" 검색 결과 없음` : '테마 데이터를 불러올 수 없습니다.'}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
