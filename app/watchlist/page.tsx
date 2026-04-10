'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useWatchlist } from '../hooks/useWatchlist';
import { useTrades } from '../hooks/useTrades';
import { calculatePosition } from '../lib/turtle';
import type { TurtleSettings, WatchlistStock, TurtleSystem, SellType, BenchmarkConfig } from '../types/stock';
import Link from 'next/link';
import AuthButton from '../components/AuthButton';

/** 숫자 포맷: 원화 */
function formatKRW(n: number): string {
  return n.toLocaleString('ko-KR');
}

/** 퍼센트 포맷 (0~1 → %) */
function formatPct(n: number, digits = 2): string {
  return `${(n * 100).toFixed(digits)}%`;
}

/** 퍼센트 포맷 (이미 % 단위) */
function formatPctRaw(n: number, digits = 2): string {
  return `${n.toFixed(digits)}%`;
}

/** 손익 컬러 */
function pnlColorClass(n: number): string {
  if (n > 0) return 'text-red-600';
  if (n < 0) return 'text-blue-600';
  return 'text-gray-500';
}

function pnlBgClass(n: number): string {
  if (n > 0) return 'bg-red-50';
  if (n < 0) return 'bg-blue-50';
  return '';
}

const SELL_TYPES: SellType[] = [
  '전량매도', '스탑로스', '손절', '트레일링스탑', '부분매도', '시스템청산', '기타',
];

/** 시스템 라벨 */
function systemLabel(s: TurtleSystem): string {
  return s === 'system1' ? 'S1 (20일)' : 'S2 (55일)';
}

/** 오늘 편입 여부 (YYYY-MM-DD 문자열 비교) */
function isNewToday(entryDate: string): boolean {
  if (!entryDate) return false;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return entryDate.startsWith(`${yyyy}-${mm}-${dd}`);
}

type SortKey =
  | 'name' | 'system' | 'entryDate' | 'tradingDays'
  | 'entryPrice' | 'currentPrice' | 'pnlPct' | 'nValue'
  | 'unitSize' | 'unitAmount' | 'stopPrice' | 'positionPct'
  | 'rrr' | 'sellSignal';
type SortDir = 'asc' | 'desc';

// ── 설정 패널 ──
function SettingsPanel({
  settings,
  onUpdate,
}: {
  settings: TurtleSettings;
  onUpdate: (s: Partial<TurtleSettings>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(settings);

  // settings prop이 변경되면 form도 동기화
  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleSave = () => {
    onUpdate(form);
    setOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSave();
  };

  if (!open) {
    return (
      <button
        onClick={() => { setForm(settings); setOpen(true); }}
        className="group text-gray-400 hover:text-black transition-colors"
        title="설정"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    );
  }

  // % 변환이 필요한 필드: 저장은 0.02, 표시는 2(%)
  const pctKeys = new Set<keyof TurtleSettings>(['riskPct', 'stopPct', 'winRate']);

  const toPctDisplay = (key: keyof TurtleSettings, val: number) =>
    pctKeys.has(key) ? Math.round(val * 10000) / 100 : val;
  const fromPctDisplay = (key: keyof TurtleSettings, val: number) =>
    pctKeys.has(key) ? val / 100 : val;

  type FieldDef = {
    key: keyof TurtleSettings;
    label: string;
    step?: string;
    suffix?: string;
    fixed?: boolean;
  };

  const fields: FieldDef[] = [
    { key: 'accountTotal', label: '계좌총액', step: '1000000', suffix: '원' },
    { key: 'riskPct', label: 'R (리스크 비율)', step: '1', suffix: '%' },
    { key: 'stopPct', label: '손절 비율', step: '1', suffix: '%' },
    { key: 'winRate', label: '승률', step: '5', suffix: '%' },
    { key: 'marketCondition', label: '시장장세', step: '1', fixed: true },
    { key: 'currentMarket', label: '현재시장', step: '1' },
    { key: 'maxUnits', label: 'UNIT', step: '1', suffix: '등분' },
    { key: 'deployedUnits', label: '투입유닛', step: '1' },
  ];

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">터틀 트레이딩 설정</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-black text-xl">×</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {fields.map(({ key, label, step, suffix, fixed }) => (
          <div key={key}>
            <label className="block text-xs text-gray-500 mb-1">{label}</label>
            <div className="flex items-center gap-1">
              {fixed ? (
                <div className="w-full border border-gray-100 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500">
                  {form[key]}
                </div>
              ) : (
                <input
                  type="text"
                  inputMode="decimal"
                  value={toPctDisplay(key, form[key]).toString()}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '' || raw === '-') {
                      setForm({ ...form, [key]: 0 });
                      return;
                    }
                    const num = Number(raw);
                    if (!isNaN(num)) {
                      setForm({ ...form, [key]: fromPctDisplay(key, num) });
                    }
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
              {suffix && <span className="text-xs text-gray-400 whitespace-nowrap">{suffix}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-4">
        <button
          type="submit"
          className="bg-black text-white px-6 py-2 rounded-lg text-sm hover:bg-gray-800 transition-colors"
        >
          적용
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-gray-500 px-4 py-2 text-sm hover:text-black"
        >
          취소
        </button>
      </div>
    </form>
  );
}

// ── 종목 테이블 행 ──
function StockRow({
  stock,
  isSelected,
  onToggle,
  dualSystem,
  index,
}: {
  stock: WatchlistStock;
  isSelected: boolean;
  onToggle: (code: string) => void;
  dualSystem: boolean;
  index: number;
}) {
  const pnlColor = stock.pnlPct > 0 ? 'text-red-600' : stock.pnlPct < 0 ? 'text-blue-600' : 'text-gray-600';
  const zebraClass = index % 2 === 1 ? 'bg-gray-50/60' : 'bg-white';
  const isNew = isNewToday(stock.entryDate);

  return (
    <tr
      className={`border-b border-gray-100 transition-colors cursor-pointer ${
        stock.sellSignal
          ? 'opacity-50 bg-red-50/30'
          : isNew
          ? 'bg-amber-50/70 hover:bg-amber-100/80 border-l-2 border-l-amber-400'
          : isSelected
          ? 'bg-blue-50/40 hover:bg-blue-50/60'
          : `${zebraClass} hover:bg-gray-100/50`
      }`}
      onClick={() => !stock.sellSignal && onToggle(stock.code)}
    >
      {/* 체크박스 */}
      <td className="py-3 px-3 text-center">
        {!stock.sellSignal ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(stock.code)}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>

      {/* 종목명 + 코드 */}
      <td className="py-3 px-4">
        <div className="font-medium text-sm flex items-center gap-1.5">
          {stock.name}
          {isNew && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
              NEW
            </span>
          )}
        </div>
        <div className="text-xs text-gray-400">{stock.code}</div>
      </td>

      {/* 시스템 */}
      <td className="py-3 px-3">
        <div className="flex items-center gap-1">
          {dualSystem ? (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center overflow-hidden"
              style={{ background: 'linear-gradient(90deg, #f0fdf4 50%, #faf5ff 50%)' }}>
              <span className="text-green-700">S1</span>
              <span className="text-gray-400 mx-0.5">/</span>
              <span className="text-purple-700">S2</span>
            </span>
          ) : (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              stock.system === 'system1'
                ? 'bg-green-50 text-green-700'
                : 'bg-purple-50 text-purple-700'
            }`}>
              {systemLabel(stock.system)}
            </span>
          )}
        </div>
      </td>

      {/* 편입일 */}
      <td className="py-3 px-3 text-sm text-gray-600">{stock.entryDate}</td>

      {/* 거래일수 */}
      <td className="py-3 px-3 text-sm text-center">
        <span className={`${stock.tradingDays >= 12 ? 'text-red-500 font-medium' : 'text-gray-600'}`}>
          {stock.tradingDays}일
        </span>
      </td>

      {/* 진입가 */}
      <td className="py-3 px-3 text-sm text-right font-mono">{formatKRW(stock.entryPrice)}</td>

      {/* 현재가 */}
      <td className="py-3 px-3 text-sm text-right font-mono">{formatKRW(stock.currentPrice)}</td>

      {/* 수익률 */}
      <td className={`py-3 px-3 text-sm text-right font-mono font-medium ${pnlColor}`}>
        {stock.pnlPct > 0 ? '+' : ''}{formatPct(stock.pnlPct)}
      </td>

      {/* N값 */}
      <td className="py-3 px-3 text-sm text-right font-mono text-gray-600">
        {stock.nValue > 0 ? formatKRW(Math.round(stock.nValue)) : '-'}
      </td>

      {/* 유닛수량 */}
      <td className="py-3 px-3 text-sm text-right font-mono">{stock.unitSize}주</td>

      {/* 유닛금액 */}
      <td className="py-3 px-3 text-sm text-right font-mono">{formatKRW(stock.unitAmount)}</td>

      {/* 손절가 */}
      <td className="py-3 px-3 text-sm text-right font-mono text-blue-600">{formatKRW(stock.stopPrice)}</td>

      {/* 비중 */}
      <td className="py-3 px-3 text-sm text-right">{formatPct(stock.positionPct, 1)}</td>

      {/* 손익비 */}
      <td className="py-3 px-3 text-sm text-right font-mono">{stock.rrr.toFixed(2)}</td>

      {/* 상태 */}
      <td className="py-3 px-3 text-center">
        {stock.sellSignal ? (
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full" title={stock.sellReason}>
            편출
          </span>
        ) : (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
            편입
          </span>
        )}
      </td>
    </tr>
  );
}

// ── 워치리스트 테이블 ──
function WatchlistTable({
  stocks,
  settings,
  selectedCodes,
  onToggle,
  onToggleAll,
}: {
  stocks: WatchlistStock[];
  settings: TurtleSettings;
  selectedCodes: Set<string>;
  onToggle: (code: string) => void;
  onToggleAll: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'system1' | 'system2' | 'sell'>('all');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // 설정값 기반으로 유닛/비중/손절가/손익비 클라이언트 재계산.
  // 서버는 자신의 기본 설정으로 1회 계산해 보내주지만, 사용자가 터틀 설정 창에서
  // 시드·R·UNIT·시장장세를 바꾸면 즉시 테이블에 반영되어야 함.
  const recomputed = useMemo<WatchlistStock[]>(() => {
    return stocks.map((s) => {
      if (s.sellSignal || !s.entryPrice) return s;
      try {
        const pos = calculatePosition(s.entryPrice, s.currentPrice || s.entryPrice, settings);
        return {
          ...s,
          unitSize: pos.unitSize,
          unitAmount: pos.positionAmount,
          stopPrice: pos.stopPrice,
          riskPerShare: pos.riskPerShare,
          positionPct: pos.positionPct,
          rrr: pos.rrr,
        };
      } catch {
        return s;
      }
    });
  }, [stocks, settings]);

  // 전체 탭: 같은 code를 가진 종목 중복 제거 (S1+S2 병합) + 정렬
  const filtered = useMemo(() => {
    let base: WatchlistStock[];
    if (filter === 'system1') base = recomputed.filter((s) => s.system === 'system1' && !s.sellSignal);
    else if (filter === 'system2') base = recomputed.filter((s) => s.system === 'system2' && !s.sellSignal);
    else if (filter === 'sell') base = recomputed.filter((s) => s.sellSignal);
    else {
      // 'all': 편출 제외 + 중복 code 제거
      const seen = new Map<string, WatchlistStock>();
      for (const s of recomputed) {
        if (s.sellSignal) continue;
        if (!seen.has(s.code)) seen.set(s.code, s);
      }
      base = Array.from(seen.values());
    }

    // 당일 새로 편입된 종목은 항상 최상단 고정 (정렬과 무관)
    const sorted = [...base].sort((a, b) => {
      const aNew = isNewToday(a.entryDate);
      const bNew = isNewToday(b.entryDate);
      if (aNew && !bNew) return -1;
      if (!aNew && bNew) return 1;

      if (!sortKey) return 0;

      let av: number | string;
      let bv: number | string;
      if (sortKey === 'name' || sortKey === 'system' || sortKey === 'entryDate') {
        av = a[sortKey] as string;
        bv = b[sortKey] as string;
      } else if (sortKey === 'sellSignal') {
        av = a.sellSignal ? 1 : 0;
        bv = b.sellSignal ? 1 : 0;
      } else {
        av = a[sortKey] as number;
        bv = b[sortKey] as number;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [recomputed, filter, sortKey, sortDir]);

  const sellCount = recomputed.filter((s) => s.sellSignal).length;
  const activeFiltered = filtered.filter((s) => !s.sellSignal);
  const allActiveSelected = activeFiltered.length > 0 && activeFiltered.every((s) => selectedCodes.has(s.code));

  return (
    <div>
      {/* 워치리스트 카드 박스 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* 필터 탭 + 선택 개수 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {[
              { key: 'all', label: `전체 (${new Set(stocks.map((s) => s.code)).size})` },
              { key: 'system1', label: `시스템1 (${stocks.filter((s) => s.system === 'system1' && !s.sellSignal).length})` },
              { key: 'system2', label: `시스템2 (${stocks.filter((s) => s.system === 'system2' && !s.sellSignal).length})` },
              { key: 'sell', label: `편출대상 (${sellCount})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key as typeof filter)}
                className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                  filter === key
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {selectedCodes.size > 0 && (
            <span className="text-xs text-blue-600 font-medium">
              {selectedCodes.size}개 선택됨
            </span>
          )}
        </div>
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '660px' }}>
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50/95 backdrop-blur-sm border-b border-gray-200">
              {/* 전체선택 체크박스 */}
              <th className="py-3 px-3 text-center w-10">
                <input
                  type="checkbox"
                  checked={allActiveSelected}
                  onChange={onToggleAll}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  title="전체 선택"
                />
              </th>
              {([
                { label: '종목', key: 'name' as SortKey },
                { label: '시스템', key: 'system' as SortKey },
                { label: '편입일', key: 'entryDate' as SortKey },
                { label: '거래일', key: 'tradingDays' as SortKey },
                { label: '진입가', key: 'entryPrice' as SortKey },
                { label: '현재가', key: 'currentPrice' as SortKey },
                { label: '수익률', key: 'pnlPct' as SortKey },
                { label: 'N값', key: 'nValue' as SortKey },
                { label: '유닛수량', key: 'unitSize' as SortKey },
                { label: '유닛금액', key: 'unitAmount' as SortKey },
                { label: '손절가', key: 'stopPrice' as SortKey },
                { label: '비중', key: 'positionPct' as SortKey },
                { label: '손익비', key: 'rrr' as SortKey },
                { label: '상태', key: 'sellSignal' as SortKey },
              ]).map(({ label, key }) => {
                const active = sortKey === key;
                return (
                  <th
                    key={label}
                    onClick={() => handleSort(key)}
                    className={`py-3 px-3 text-xs font-medium whitespace-nowrap cursor-pointer select-none transition-colors ${
                      active ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <span className={`text-[9px] ${active ? 'opacity-100' : 'opacity-30'}`}>
                        {active ? (sortDir === 'asc' ? '▲' : '▼') : '▼'}
                      </span>
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={15} className="py-12 text-center text-gray-400 text-sm">
                  {filter === 'sell' ? '편출 대상 종목이 없습니다.' : '워치리스트에 종목이 없습니다.'}
                </td>
              </tr>
            ) : (
              filtered.map((stock, idx) => {
                const dualSystem = stocks.some(
                  (s) => s.code === stock.code && s.system !== stock.system
                );
                return (
                <StockRow
                  key={`${stock.code}-${stock.system}`}
                  stock={stock}
                  isSelected={selectedCodes.has(stock.code)}
                  onToggle={onToggle}
                  dualSystem={dualSystem}
                  index={idx}
                />
                );
              })
            )}
          </tbody>
        </table>
        </div>

        {/* 편출 사유 범례 — 편출 탭에서만 표시 */}
        {filter === 'sell' && sellCount > 0 && (
          <div className="px-5 py-4 border-t border-gray-100 bg-red-50/30">
            <div className="text-xs font-medium text-red-700 mb-2">편출 대상 사유</div>
            <div className="flex flex-wrap gap-2">
              {stocks
                .filter((s) => s.sellSignal && s.sellReason)
                .map((s) => (
                  <span key={s.code} className="text-xs text-red-600">
                    {s.name}: {s.sellReason}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 터틀 시스템 설명 카드 ──
function SystemInfo() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
      <div className="bg-green-50/50 border border-green-100 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">시스템 1</span>
          <span className="text-sm text-gray-600">단기 (20일)</span>
        </div>
        <div className="text-sm text-gray-700 space-y-1">
          <p><span className="font-medium text-green-700">진입:</span> 20일 최고가 돌파</p>
          <p><span className="font-medium text-red-600">청산:</span> 10일 최저가 이탈</p>
          <p className="text-xs text-gray-500 mt-2">직전 시그널이 수익이었으면 건너뜀 → 55일 돌파를 안전장치로 사용</p>
        </div>
      </div>
      <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-purple-100 text-purple-700 text-xs font-medium px-2 py-0.5 rounded-full">시스템 2</span>
          <span className="text-sm text-gray-600">장기 (55일)</span>
        </div>
        <div className="text-sm text-gray-700 space-y-1">
          <p><span className="font-medium text-purple-700">진입:</span> 55일 최고가 돌파</p>
          <p><span className="font-medium text-red-600">청산:</span> 20일 최저가 이탈</p>
          <p className="text-xs text-gray-500 mt-2">모든 시그널을 무조건 따름</p>
        </div>
      </div>
    </div>
  );
}

// ── Ledger: 새 거래 입력 폼 ──
function TradeForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (trade: Parameters<ReturnType<typeof useTrades>['addTrade']>[0]) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    stockName: '',
    stockCode: '',
    source: 'Dennis',
    entryDate: '',
    exitDate: '',
    entryPrice: '',
    exitPrice: '',
    quantity: '',
    sellType: '전량매도' as SellType,
    sellReason: '',
    units: '1',
    memo: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.stockName || !form.entryDate || !form.exitDate || !form.entryPrice || !form.exitPrice || !form.quantity) {
      return;
    }
    onSubmit({
      stockName: form.stockName,
      stockCode: form.stockCode,
      source: form.source,
      entryDate: form.entryDate,
      exitDate: form.exitDate,
      entryPrice: Number(form.entryPrice),
      exitPrice: Number(form.exitPrice),
      quantity: Number(form.quantity),
      sellType: form.sellType,
      sellReason: form.sellReason || undefined,
      units: Number(form.units) || 1,
      memo: form.memo || undefined,
    });
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent';
  const labelClass = 'block text-xs text-gray-500 mb-1';

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-semibold text-gray-900">새 거래 기록</h3>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <label className={labelClass}>종목명 *</label>
          <input className={inputClass} value={form.stockName} onChange={(e) => setForm({ ...form, stockName: e.target.value })} placeholder="삼성전자" />
        </div>
        <div>
          <label className={labelClass}>종목코드</label>
          <input className={inputClass} value={form.stockCode} onChange={(e) => setForm({ ...form, stockCode: e.target.value })} placeholder="005930" />
        </div>
        <div>
          <label className={labelClass}>출처</label>
          <select className={inputClass} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            <option value="Dennis">Dennis</option>
            <option value="기타">기타</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>유닛수</label>
          <input className={inputClass} type="text" inputMode="numeric" value={form.units} onChange={(e) => setForm({ ...form, units: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <label className={labelClass}>진입일 *</label>
          <input className={inputClass} type="date" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>청산일 *</label>
          <input className={inputClass} type="date" value={form.exitDate} onChange={(e) => setForm({ ...form, exitDate: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>진입가 *</label>
          <input className={inputClass} type="text" inputMode="decimal" value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} placeholder="0" />
        </div>
        <div>
          <label className={labelClass}>청산가 *</label>
          <input className={inputClass} type="text" inputMode="decimal" value={form.exitPrice} onChange={(e) => setForm({ ...form, exitPrice: e.target.value })} placeholder="0" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <label className={labelClass}>수량 *</label>
          <input className={inputClass} type="text" inputMode="numeric" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="0" />
        </div>
        <div>
          <label className={labelClass}>매도유형</label>
          <select className={inputClass} value={form.sellType} onChange={(e) => setForm({ ...form, sellType: e.target.value as SellType })}>
            {SELL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>매도사유 / 메모</label>
          <input className={inputClass} value={form.sellReason} onChange={(e) => setForm({ ...form, sellReason: e.target.value })} placeholder="청산 사유 입력" />
        </div>
      </div>

      {form.entryPrice && form.exitPrice && form.quantity && (
        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-gray-500">투자금: </span>
              <span className="font-medium">{formatKRW(Number(form.entryPrice) * Number(form.quantity))}원</span>
            </div>
            <div>
              <span className="text-gray-500">손익금액: </span>
              <span className={`font-medium ${pnlColorClass((Number(form.exitPrice) - Number(form.entryPrice)) * Number(form.quantity))}`}>
                {formatKRW((Number(form.exitPrice) - Number(form.entryPrice)) * Number(form.quantity))}원
              </span>
            </div>
            <div>
              <span className="text-gray-500">수익률: </span>
              <span className={`font-medium ${pnlColorClass(Number(form.exitPrice) - Number(form.entryPrice))}`}>
                {formatPctRaw(((Number(form.exitPrice) - Number(form.entryPrice)) / Number(form.entryPrice)) * 100)}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          취소
        </button>
        <button type="submit" className="px-6 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors">
          기록 추가
        </button>
      </div>
    </form>
  );
}

// ── Ledger: 벤치마크 패널 ──
function BenchmarkPanel({
  benchmark,
  summary,
  onUpdate,
}: {
  benchmark: BenchmarkConfig;
  summary: { totalPnl: number; totalPnlPct: number; currentSeed: number };
  onUpdate: (b: Partial<BenchmarkConfig>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(benchmark);

  const handleSave = () => {
    onUpdate(form);
    setEditing(false);
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">벤치마크 비교</h3>
        {!editing && (
          <button
            onClick={() => { setForm(benchmark); setEditing(true); }}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            설정
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">벤치마크 지수</label>
              <select className={inputClass} value={form.indexName} onChange={(e) => setForm({ ...form, indexName: e.target.value })}>
                <option value="코스닥">코스닥</option>
                <option value="코스피">코스피</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">시작일</label>
              <input className={inputClass} type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">종료일</label>
              <input className={inputClass} type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">최초시드</label>
              <input className={inputClass} type="text" inputMode="numeric" value={form.initialSeed || ''} onChange={(e) => setForm({ ...form, initialSeed: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">취소</button>
            <button onClick={handleSave} className="px-4 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-800">저장</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <div className="text-xs text-gray-500 mb-1">벤치마크</div>
            <div className="text-lg font-semibold">{benchmark.indexName}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">최초시드</div>
            <div className="text-lg font-semibold">{formatKRW(benchmark.initialSeed)}원</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">현재시드</div>
            <div className={`text-lg font-semibold ${pnlColorClass(summary.currentSeed - benchmark.initialSeed)}`}>
              {formatKRW(summary.currentSeed)}원
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">실현수익</div>
            <div className={`text-lg font-semibold ${pnlColorClass(summary.totalPnl)}`}>
              {summary.totalPnl >= 0 ? '+' : ''}{formatKRW(summary.totalPnl)}원
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">트레이드 성과</div>
            <div className={`text-lg font-semibold ${pnlColorClass(summary.totalPnlPct)}`}>
              {summary.totalPnlPct >= 0 ? '+' : ''}{formatPctRaw(summary.totalPnlPct)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ledger: 요약 카드 ──
function TradeSummaryCards({ summary }: { summary: NonNullable<ReturnType<typeof useTrades>['data']>['summary'] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="text-xs text-gray-500 mb-1">총 거래</div>
        <div className="text-xl font-semibold">{summary.totalTrades}건</div>
      </div>
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="text-xs text-gray-500 mb-1">승/패</div>
        <div className="text-xl font-semibold">
          <span className="text-red-600">{summary.winCount}</span>
          <span className="text-gray-300 mx-1">/</span>
          <span className="text-blue-600">{summary.loseCount}</span>
        </div>
      </div>
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="text-xs text-gray-500 mb-1">승률</div>
        <div className="text-xl font-semibold">{formatPctRaw(summary.winRate)}</div>
      </div>
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="text-xs text-gray-500 mb-1">평균 수익률</div>
        <div className={`text-xl font-semibold ${pnlColorClass(summary.avgPnlPct)}`}>{formatPctRaw(summary.avgPnlPct)}</div>
      </div>
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="text-xs text-gray-500 mb-1">최대 수익 / 손실</div>
        <div className="text-sm font-semibold">
          <span className="text-red-600">{formatPctRaw(summary.maxWinPct)}</span>
          <span className="text-gray-300 mx-1">/</span>
          <span className="text-blue-600">{formatPctRaw(summary.maxLossPct)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Ledger 섹션 ──
function LedgerSection() {
  const { data, loading, error, addTrade, removeTrade, updateBenchmark } = useTrades();
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const d = await res.json();
      setIsLoggedIn(!!d.user);
    } catch { setIsLoggedIn(false); }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const handleAddTrade = async (trade: Parameters<typeof addTrade>[0]) => {
    try {
      await addTrade(trade);
      setShowForm(false);
    } catch { /* error handled in hook */ }
  };

  const handleDelete = async (id: string) => {
    await removeTrade(id);
    setDeleteConfirm(null);
  };

  return (
    <section className="px-6 pb-16">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Ledger</h2>
          <button
            onClick={() => isLoggedIn ? setShowForm(!showForm) : (window.location.href = '/login')}
            className="px-4 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-800 transition-colors"
          >
            + 기록 추가
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-xl p-4 mb-6">{error}</div>
        )}

        {loading && !data && (
          <div className="text-center py-12 text-gray-400 text-sm">로딩 중...</div>
        )}

        {data && (
          <>
            <TradeSummaryCards summary={data.summary} />

            <div className="mb-6">
              <BenchmarkPanel
                benchmark={data.benchmark}
                summary={data.summary}
                onUpdate={updateBenchmark}
              />
            </div>

            {showForm && (
              <TradeForm onSubmit={handleAddTrade} onCancel={() => setShowForm(false)} />
            )}

            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900">거래 내역</h3>
              </div>

              {data.trades.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm">
                  아직 기록된 거래가 없습니다.
                  {isLoggedIn && (
                    <>
                      <br />
                      <button onClick={() => setShowForm(true)} className="text-gray-600 underline mt-2 inline-block">
                        첫 거래를 기록해보세요
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs">
                        <th className="px-4 py-3 text-left font-medium">#</th>
                        <th className="px-4 py-3 text-left font-medium">종목</th>
                        <th className="px-4 py-3 text-left font-medium">기간</th>
                        <th className="px-4 py-3 text-right font-medium">수익률</th>
                        <th className="px-4 py-3 text-left font-medium">매도유형</th>
                        <th className="px-4 py-3 text-right font-medium">손익금액</th>
                        <th className="px-4 py-3 text-right font-medium">투자금</th>
                        <th className="px-4 py-3 text-right font-medium">현재시드</th>
                        <th className="px-4 py-3 text-center font-medium">유닛</th>
                        <th className="px-4 py-3 text-center font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.trades.map((trade, idx) => (
                        <tr
                          key={trade.id}
                          className={`border-t border-gray-50 hover:bg-gray-50/50 transition-colors ${pnlBgClass(trade.pnlAmount)}`}
                        >
                          <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{trade.stockName}</div>
                            {trade.stockCode && (
                              <div className="text-xs text-gray-400">{trade.stockCode}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            <div>{trade.entryDate}</div>
                            <div className="text-xs text-gray-400">~ {trade.exitDate}</div>
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold ${pnlColorClass(trade.pnlPct)}`}>
                            {trade.pnlPct >= 0 ? '+' : ''}{formatPctRaw(trade.pnlPct)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                              trade.sellType === '손절' || trade.sellType === '스탑로스'
                                ? 'bg-blue-100 text-blue-700'
                                : trade.sellType === '전량매도'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-gray-100 text-gray-700'
                            }`}>
                              {trade.sellType}
                            </span>
                            {trade.sellReason && (
                              <div className="text-xs text-gray-400 mt-0.5">{trade.sellReason}</div>
                            )}
                          </td>
                          <td className={`px-4 py-3 text-right font-medium ${pnlColorClass(trade.pnlAmount)}`}>
                            {trade.pnlAmount >= 0 ? '+' : ''}{formatKRW(trade.pnlAmount)}원
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {formatKRW(trade.investAmount)}원
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {formatKRW(trade.currentSeed)}원
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">
                            {trade.units}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {deleteConfirm === trade.id ? (
                              <div className="flex gap-1 justify-center">
                                <button onClick={() => handleDelete(trade.id)} className="text-xs text-red-600 hover:text-red-800">삭제</button>
                                <button onClick={() => setDeleteConfirm(null)} className="text-xs text-gray-400 hover:text-gray-600">취소</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirm(trade.id)} className="text-gray-300 hover:text-red-500 transition-colors text-xs">
                                &times;
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ── 메인 페이지 ──
export default function WatchlistPage() {
  const { data, loading, error, refresh, updateSettings } = useWatchlist();
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());

  const handleToggle = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (!data) return;
    const activeCodes = data.stocks.filter((s) => !s.sellSignal).map((s) => s.code);
    const allSelected = activeCodes.every((c) => selectedCodes.has(c));
    if (allSelected) {
      setSelectedCodes(new Set());
    } else {
      setSelectedCodes(new Set(activeCodes));
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* 네비게이션 — 홈과 동일한 구조 */}
      <nav className="fixed top-0 w-full bg-[#1d1d1f]/95 backdrop-blur-xl z-50">
        <div className="max-w-7xl mx-auto px-6 h-11 flex items-center">
          <Link href="/" className="text-white text-xl font-semibold tracking-tight">OURTLE</Link>
          <div className="flex items-center gap-14 ml-14">
            <Link href="/" className="text-xs tracking-wide text-white/70 hover:text-white transition-colors">Home</Link>
            <span className="text-xs tracking-wide text-white font-medium">Turtle</span>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            {data?.lastUpdated && (
              <span className="text-[10px] text-[#86868b]">
                {new Date(data.lastUpdated).toLocaleTimeString('ko-KR')}
              </span>
            )}
            <button
              onClick={() => refresh(true, true)}
              className="text-xs text-[#86868b] hover:text-white transition-colors"
            >
              ↻
            </button>
            <AuthButton />
          </div>
        </div>
      </nav>

      {/* 헤더 */}
      <section className="pt-24 pb-6 px-6">
        <div className="max-w-7xl mx-auto">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-br from-gray-900 to-gray-600 bg-clip-text text-transparent">
              Turtle
            </h1>
          </div>

          {error && (
            <div className="mt-4 text-sm text-red-500 bg-red-50 px-4 py-2 rounded-lg inline-block">
              {error} — 자동 재시도 중
            </div>
          )}
        </div>
      </section>

      {/* 로딩 */}
      {loading && !data && (
        <section className="px-6">
          <div className="max-w-7xl mx-auto">
            <div className="animate-pulse space-y-4">
              <div className="grid grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-20 bg-gray-100 rounded-xl" />
                ))}
              </div>
              <div className="h-96 bg-gray-100 rounded-xl" />
            </div>
          </div>
        </section>
      )}

      {/* 콘텐츠 */}
      {data && (
        <section className="px-6 pb-16">
          <div className="max-w-7xl mx-auto">
            {/* Turtle Trading */}
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Turtle Trading</h2>
            <SystemInfo />

            {/* 자동 편출 규칙 (시스템 설명 박스 바로 아래) */}
            <div className="bg-gray-100 border border-gray-200 rounded-xl px-5 py-4 mb-8">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">자동 편출 규칙</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-600">
                <div className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">●</span>
                  <span>손절가 이탈 시 즉시 편출</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-orange-500 mt-0.5">●</span>
                  <span>시스템별 청산 시그널 발생 시 편출 (S1: 10일 저가 이탈, S2: 20일 저가 이탈)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-gray-500 mt-0.5">●</span>
                  <span>편입 후 14거래일 경과 시 자동 편출</span>
                </div>
              </div>
            </div>

            {/* Watchlist */}
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Watchlist</h2>
              <SettingsPanel settings={data.settings} onUpdate={updateSettings} />
            </div>
            <WatchlistTable
              stocks={data.stocks}
              settings={data.settings}
              selectedCodes={selectedCodes}
              onToggle={handleToggle}
              onToggleAll={handleToggleAll}
            />
          </div>
        </section>
      )}

      {/* Ledger 섹션 (트레이드 로그) */}
      <LedgerSection />

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-gray-100">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <p className="text-sm text-gray-400">
            © 2026 OURTLE. J.Kim of Unimind
          </p>
          {data?.lastUpdated && (
            <p className="text-xs text-gray-300">
              마지막 업데이트: {new Date(data.lastUpdated).toLocaleString('ko-KR')}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}
