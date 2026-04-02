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
      const result = await res.json();
      // API 에러 응답 체크
      if (result.error || !result.items || result.items.length === 0) {
        console.log('[RankingSection] Empty or error:', result);
        setData(null);
      } else {
        dataRef.current.set(type, result);
        setData(result);
      }
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
    <div>
      <h2 className="text-lg font-bold text-gray-900 mb-3">시장 순위</h2>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
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
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        </div>
      )}

      {!loading && data && data.items.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-gray-100 text-[10px] text-gray-400">
                  <th className="text-left py-2 px-3 font-medium w-6">#</th>
                  <th className="text-left py-2 px-2 font-medium">종목</th>
                  <th className="text-right py-2 px-2 font-medium">현재가</th>
                  <th className="text-right py-2 px-2 font-medium">등락률</th>
                  <th className="text-right py-2 px-3 font-medium hidden sm:table-cell">거래량</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, idx) => {
                  const isUp = item.change >= 0;
                  const color = item.change === 0 ? 'text-gray-600' : isUp ? 'text-red-500' : 'text-blue-500';
                  return (
                    <tr
                      key={item.code}
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => onStockClick?.({ code: item.code, name: item.name })}
                    >
                      <td className="py-1.5 px-3 text-gray-400 text-[10px]">{idx + 1}</td>
                      <td className="py-1.5 px-2">
                        <div className="font-medium text-gray-900 text-xs truncate max-w-[120px]">{item.name}</div>
                      </td>
                      <td className="py-1.5 px-2 text-right font-medium">{item.price.toLocaleString()}</td>
                      <td className={`py-1.5 px-2 text-right font-medium ${color}`}>
                        {isUp ? '+' : ''}{item.changeRate.toFixed(2)}%
                      </td>
                      <td className="py-1.5 px-3 text-right text-gray-500 hidden sm:table-cell">
                        {formatVolume(item.volume)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && (!data || data.items.length === 0) && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center text-gray-400 text-sm">
          데이터를 불러올 수 없습니다
        </div>
      )}
    </div>
  );
}
