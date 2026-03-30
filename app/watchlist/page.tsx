'use client';

import { useState, useMemo } from 'react';
import { useWatchlist } from '../hooks/useWatchlist';
import type { TurtleSettings, WatchlistStock, TurtleSystem } from '../types/stock';
import Link from 'next/link';

/** 숫자 포맷: 원화 */
function formatKRW(n: number): string {
  return n.toLocaleString('ko-KR');
}

/** 퍼센트 포맷 */
function formatPct(n: number, digits = 2): string {
  return `${(n * 100).toFixed(digits)}%`;
}

/** 시스템 라벨 */
function systemLabel(s: TurtleSystem): string {
  return s === 'system1' ? 'S1 (20일)' : 'S2 (55일)';
}

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

  const handleSave = () => {
    onUpdate(form);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => { setForm(settings); setOpen(true); }}
        className="text-sm text-gray-500 hover:text-black transition-colors border border-gray-200 rounded-lg px-4 py-2"
      >
        ⚙ 계산기
      </button>
    );
  }

  const fields: { key: keyof TurtleSettings; label: string; step?: string; suffix?: string }[] = [
    { key: 'accountTotal', label: '계좌총액', step: '1000000', suffix: '원' },
    { key: 'riskPct', label: 'R (리스크 비율)', step: '0.005', suffix: '' },
    { key: 'stopPct', label: '손절 비율', step: '0.01', suffix: '' },
    { key: 'winRate', label: '승률', step: '0.05', suffix: '' },
    { key: 'marketCondition', label: '시장장세', step: '1' },
    { key: 'currentMarket', label: '현재시장', step: '1' },
    { key: 'maxUnits', label: '최대 유닛', step: '1' },
    { key: 'deployedUnits', label: '투입유닛', step: '1' },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">터틀 트레이딩 설정</h3>
        <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-black text-xl">×</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {fields.map(({ key, label, step, suffix }) => (
          <div key={key}>
            <label className="block text-xs text-gray-500 mb-1">{label}</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step={step}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {suffix && <span className="text-xs text-gray-400 whitespace-nowrap">{suffix}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-4">
        <button onClick={handleSave} className="bg-black text-white px-6 py-2 rounded-lg text-sm hover:bg-gray-800 transition-colors">
          저장
        </button>
        <button onClick={() => setOpen(false)} className="text-gray-500 px-4 py-2 text-sm hover:text-black">
          취소
        </button>
      </div>
    </div>
  );
}

// ── 요약 카드 (선택된 종목 기준) ──
function SummaryCards({
  settings,
  stocks,
  selectedCodes,
}: {
  settings: TurtleSettings;
  stocks: WatchlistStock[];
  selectedCodes: Set<string>;
}) {
  const selectedStocks = stocks.filter((s) => selectedCodes.has(s.code) && !s.sellSignal);
  const s1Count = selectedStocks.filter((s) => s.system === 'system1').length;
  const s2Count = selectedStocks.filter((s) => s.system === 'system2').length;
  const totalExposure = selectedStocks.reduce((sum, s) => sum + s.unitAmount, 0);
  const exposurePct = settings.accountTotal > 0 ? totalExposure / settings.accountTotal : 0;
  const riskAmount = settings.accountTotal * settings.riskPct;

  const hasSelection = selectedCodes.size > 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
      {[
        { label: '계좌총액', value: `₩${formatKRW(settings.accountTotal)}`, color: '' },
        { label: '1R 금액', value: `₩${formatKRW(riskAmount)}`, color: 'text-blue-600' },
        {
          label: '시스템1',
          value: hasSelection ? `${s1Count}종목` : '-',
          color: hasSelection ? 'text-green-600' : 'text-gray-300',
        },
        {
          label: '시스템2',
          value: hasSelection ? `${s2Count}종목` : '-',
          color: hasSelection ? 'text-purple-600' : 'text-gray-300',
        },
        {
          label: '총 투입비중',
          value: hasSelection ? formatPct(exposurePct, 1) : '-',
          color: hasSelection
            ? exposurePct > 0.5
              ? 'text-red-600'
              : 'text-gray-900'
            : 'text-gray-300',
        },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-white border border-gray-100 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">{label}</div>
          <div className={`text-xl font-bold ${color}`}>{value}</div>
        </div>
      ))}
      {!hasSelection && (
        <div className="col-span-2 md:col-span-5">
          <p className="text-xs text-gray-400 text-center">
            아래 워치리스트에서 종목을 선택하면 투입 시드가 계산됩니다.
          </p>
        </div>
      )}
    </div>
  );
}

// ── 종목 테이블 행 ──
function StockRow({
  stock,
  isSelected,
  onToggle,
}: {
  stock: WatchlistStock;
  isSelected: boolean;
  onToggle: (code: string) => void;
}) {
  const pnlColor = stock.pnlPct > 0 ? 'text-red-600' : stock.pnlPct < 0 ? 'text-blue-600' : 'text-gray-600';

  return (
    <tr
      className={`border-b border-gray-50 transition-colors cursor-pointer ${
        stock.sellSignal
          ? 'opacity-50 bg-red-50/30'
          : isSelected
          ? 'bg-blue-50/40 hover:bg-blue-50/60'
          : 'hover:bg-gray-50/50'
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
        <div className="font-medium text-sm">{stock.name}</div>
        <div className="text-xs text-gray-400">{stock.code}</div>
      </td>

      {/* 시스템 */}
      <td className="py-3 px-3">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          stock.system === 'system1'
            ? 'bg-green-50 text-green-700'
            : 'bg-purple-50 text-purple-700'
        }`}>
          {systemLabel(stock.system)}
        </span>
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
  selectedCodes,
  onToggle,
  onToggleAll,
}: {
  stocks: WatchlistStock[];
  selectedCodes: Set<string>;
  onToggle: (code: string) => void;
  onToggleAll: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'system1' | 'system2' | 'sell'>('all');

  const filtered = stocks.filter((s) => {
    if (filter === 'system1') return s.system === 'system1' && !s.sellSignal;
    if (filter === 'system2') return s.system === 'system2' && !s.sellSignal;
    if (filter === 'sell') return s.sellSignal;
    return true;
  });

  const sellCount = stocks.filter((s) => s.sellSignal).length;
  const activeFiltered = filtered.filter((s) => !s.sellSignal);
  const allActiveSelected = activeFiltered.length > 0 && activeFiltered.every((s) => selectedCodes.has(s.code));

  return (
    <div>
      {/* 필터 탭 + 선택 개수 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {[
            { key: 'all', label: `전체 (${stocks.length})` },
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

      {/* 테이블 */}
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100">
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
              {['종목', '시스템', '편입일', '거래일', '진입가', '현재가', '수익률', 'N값', '유닛수량', '유닛금액', '손절가', '비중', '손익비', '상태'].map((h) => (
                <th key={h} className="py-3 px-3 text-xs font-medium text-gray-500 whitespace-nowrap">
                  {h}
                </th>
              ))}
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
              filtered.map((stock) => (
                <StockRow
                  key={stock.code}
                  stock={stock}
                  isSelected={selectedCodes.has(stock.code)}
                  onToggle={onToggle}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 편출 사유 범례 */}
      {sellCount > 0 && (
        <div className="mt-4 p-4 bg-red-50/50 rounded-xl">
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
      {/* 네비게이션 — Apple 스타일 */}
      <nav className="fixed top-0 w-full bg-[#1d1d1f]/95 backdrop-blur-xl z-50">
        <div className="max-w-[980px] mx-auto px-6 h-11 flex items-center justify-between">
          <Link href="/" className="text-white text-xl font-semibold tracking-tight">OURTLE</Link>
          <div className="flex items-center gap-7">
            <Link href="/" className="text-xs tracking-wide text-[#d1d1d6] hover:text-white transition-colors">Home</Link>
            <span className="text-xs tracking-wide text-white">Dennis</span>
          </div>
          <div className="flex items-center gap-4">
            {data?.lastUpdated && (
              <span className="text-[10px] text-[#86868b]">
                {new Date(data.lastUpdated).toLocaleTimeString('ko-KR')}
              </span>
            )}
            <button
              onClick={() => refresh()}
              className="text-xs text-[#86868b] hover:text-white transition-colors"
            >
              ↻
            </button>
          </div>
        </div>
      </nav>

      {/* 헤더 */}
      <section className="pt-24 pb-6 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 bg-gradient-to-br from-gray-900 to-gray-600 bg-clip-text text-transparent">
                Dennis
              </h1>
              <p className="text-xs text-gray-400 mb-1">터틀 트레이딩 워치리스트</p>
              <p className="text-gray-500">
                시스템 1·2 기준 자동 편입 — N값·유닛·손절가 실시간 계산
              </p>
            </div>
            {data && (
              <SettingsPanel settings={data.settings} onUpdate={updateSettings} />
            )}
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
            <SystemInfo />
            <SummaryCards settings={data.settings} stocks={data.stocks} selectedCodes={selectedCodes} />
            <WatchlistTable
              stocks={data.stocks}
              selectedCodes={selectedCodes}
              onToggle={handleToggle}
              onToggleAll={handleToggleAll}
            />
          </div>
        </section>
      )}

      {/* 공통 규칙 안내 */}
      <section className="px-6 pb-16">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gray-50 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">자동 편출 규칙</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
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
        </div>
      </section>

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
