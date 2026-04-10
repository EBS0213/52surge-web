'use client';

import { useState, useEffect, useCallback } from 'react';
import Navbar from '../components/Navbar';

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

function RSBar({ rs }: { rs: number }) {
  // 0~100 스케일. 50이 중립, 50 이상 강세, 이하 약세
  const isStrong = rs >= 50;
  // 바 길이: 중심(50)에서 떨어진 거리 비율
  const pct = Math.abs(rs - 50) * 2; // 0~100%
  const color =
    rs >= 70 ? 'bg-red-500' :
    rs >= 50 ? 'bg-red-300' :
    rs >= 30 ? 'bg-blue-300' :
    'bg-blue-500';

  return (
    <div className="flex items-center gap-0 w-full">
      {/* 약세 영역 (왼쪽) */}
      <div className="flex-1 flex justify-end">
        {!isStrong && (
          <div className={`h-5 rounded-l-sm ${color}`} style={{ width: `${pct}%` }} />
        )}
      </div>
      {/* 중심선 (50) */}
      <div className="w-px h-6 bg-gray-400 flex-shrink-0" />
      {/* 강세 영역 (오른쪽) */}
      <div className="flex-1">
        {isStrong && (
          <div className={`h-5 rounded-r-sm ${color}`} style={{ width: `${pct}%` }} />
        )}
      </div>
    </div>
  );
}

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
          <div className="flex items-end justify-between mb-6 mt-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">산업별 RS</h1>
              <p className="text-sm text-gray-500 mt-1">
                업종별 Relative Strength — KOSPI 대비 상대 강도
              </p>
            </div>
          </div>

          {/* 기간 선택 탭 */}
          <div className="flex gap-1.5 mb-4">
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

          {/* 벤치마크 카드 */}
          {data && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center gap-6">
              <div>
                <span className="text-xs text-gray-400">벤치마크</span>
                <div className="text-lg font-bold">{data.benchmark.name}</div>
              </div>
              <div>
                <span className="text-xs text-gray-400">현재 지수</span>
                <div className="text-sm font-mono font-medium">
                  {data.benchmark.currentIndex.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-400">{period}일 수익률</span>
                <div className={`text-sm font-mono font-medium ${
                  data.benchmark.periodReturn > 0 ? 'text-red-600' : data.benchmark.periodReturn < 0 ? 'text-blue-600' : 'text-gray-600'
                }`}>
                  {data.benchmark.periodReturn > 0 ? '+' : ''}{data.benchmark.periodReturn.toFixed(2)}%
                </div>
              </div>
              <div className="ml-auto text-xs text-gray-400">
                70 이상 = 강세 | 30 이하 = 약세 (RSI 스타일)
              </div>
            </div>
          )}

          {/* 로딩 */}
          {loading && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            </div>
          )}

          {/* 에러 */}
          {!loading && error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-6 text-center text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* RS 테이블 */}
          {!loading && data && data.sectors.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="py-3 px-3 text-left text-xs font-medium text-gray-500 w-8">#</th>
                      <th className="py-3 px-3 text-left text-xs font-medium text-gray-500">업종</th>
                      <th className="py-3 px-3 text-right text-xs font-medium text-gray-500">현재 지수</th>
                      <th className="py-3 px-3 text-right text-xs font-medium text-gray-500">등락률</th>
                      <th className="py-3 px-3 text-right text-xs font-medium text-gray-500">{period}일 수익률</th>
                      <th className="py-3 px-3 text-right text-xs font-medium text-gray-500 w-20">RS</th>
                      <th className="py-3 px-4 text-xs font-medium text-gray-500 w-64 text-center">약세 ← → 강세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sectors.map((sector, idx) => {
                      const changeColor =
                        sector.changeRate > 0 ? 'text-red-600'
                        : sector.changeRate < 0 ? 'text-blue-600'
                        : 'text-gray-500';
                      const returnColor =
                        sector.periodReturn > 0 ? 'text-red-600'
                        : sector.periodReturn < 0 ? 'text-blue-600'
                        : 'text-gray-500';
                      const rsBg =
                        sector.rs >= 70 ? 'bg-green-300 text-green-900'
                        : sector.rs >= 50 ? 'bg-yellow-200 text-yellow-900'
                        : sector.rs >= 30 ? 'bg-gray-200 text-gray-700'
                        : sector.rs >= 15 ? 'bg-orange-200 text-orange-900'
                        : 'bg-red-300 text-red-900';

                      return (
                        <tr
                          key={sector.code}
                          className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                            idx % 2 === 1 ? 'bg-gray-50/30' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-xs text-gray-400">{sector.rsRank}</td>
                          <td className="py-2.5 px-3 font-medium text-gray-900">{sector.name}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-gray-700">
                            {sector.currentIndex.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono ${changeColor}`}>
                            {sector.changeRate > 0 ? '+' : ''}{sector.changeRate.toFixed(2)}%
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono ${returnColor}`}>
                            {sector.periodReturn > 0 ? '+' : ''}{sector.periodReturn.toFixed(2)}%
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className={`inline-block px-2 py-0.5 rounded font-mono text-sm ${rsBg}`}>
                              {sector.rs.toFixed(1)}
                            </span>
                          </td>
                          <td className="py-2.5 px-4">
                            <RSBar rs={sector.rs} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
