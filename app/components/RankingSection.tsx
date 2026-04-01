'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface RankItem {
  rank: number;
  code: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume: number;
  tradingValue: number;
}

interface RankingData {
  type: string;
  label: string;
  items: RankItem[];
}

type TabKey = 'volume' | 'gainers' | 'losers' | 'newhigh';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'volume', label: '거래량 TOP' },
  { key: 'gainers', label: '상승 TOP' },
  { key: 'losers', label: '하락 TOP' },
  { key: 'newhigh', label: '신고가 근접' },
];

export default function RankingSection({ onStockClick }: { onStockClick?: (stock: { code: string; name: string }) => void }) {
  const [tab, setTab] = useState<TabKey>('volume');
  const [data, setData] = useState<RankingData | null>(null);
  const [loading, setLoading] = useState(true);
  const dataRef = useRef<Map<string, RankingData>>(new Map());

  const fetchRanking = useCallback(async (type: TabKey) => {
    // 캐시 확인
    const cached = dataRef.current.get(type);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/kis/rankings?type=${type}`);
      if (!res.ok) throw new Error('Failed');
      const result: RankingData = await res.json();
      dataRef.current.set(type, result);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRanking(tab);
  }, [tab, fetchRanking]);

  const formatVolume = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}백만`;
    if (v >= 10_000) return `${(v / 10_000).toFixed(0)}만`;
    return v.toLocaleString();
  };

  const formatValue = (v: number) => {
    if (v >= 1_000_000_000_000) return `${(v / 1_000_000_000_000).toFixed(1)}조`;
    if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(0)}억`;
    return `${(v / 10_000).toFixed(0)}만`;
  };

  return (
    <section className="py-6 px-6">
      <div className="max-w-[980px] mx-auto">
        <h2 className="text-xl font-bold text-gray-900 mb-4">시장 순위</h2>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-colors ${
                tab === key
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8">
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {!loading && data && data.items.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="text-left py-3 px-4 font-medium w-8">#</th>
                  <th className="text-left py-3 px-2 font-medium">종목</th>
                  <th className="text-right py-3 px-2 font-medium">현재가</th>
                  <th className="text-right py-3 px-2 font-medium">등락률</th>
                  <th className="text-right py-3 px-4 font-medium hidden sm:table-cell">거래량</th>
                  <th className="text-right py-3 px-4 font-medium hidden md:table-cell">거래대금</th>
                </tr>
              </thead>
              <tbody>
                {data.items.slice(0, 15).map((item, idx) => {
                  const isUp = item.change >= 0;
                  const color = item.change === 0 ? 'text-gray-600' : isUp ? 'text-red-500' : 'text-blue-500';
                  return (
                    <tr
                      key={item.code}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => onStockClick?.({ code: item.code, name: item.name })}
                    >
                      <td className="py-2.5 px-4 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="py-2.5 px-2">
                        <div className="font-medium text-gray-900 text-sm">{item.name}</div>
                        <div className="text-xs text-gray-400">{item.code}</div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-medium">{item.price.toLocaleString()}</td>
                      <td className={`py-2.5 px-2 text-right font-medium ${color}`}>
                        {isUp ? '+' : ''}{item.changeRate.toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-4 text-right text-gray-500 hidden sm:table-cell">
                        {formatVolume(item.volume)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-gray-500 hidden md:table-cell">
                        {formatValue(item.tradingValue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (!data || data.items.length === 0) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
            데이터를 불러올 수 없습니다
          </div>
        )}
      </div>
    </section>
  );
}
