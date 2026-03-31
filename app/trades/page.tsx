'use client';

import { useState } from 'react';
import { useTrades } from '../hooks/useTrades';
import type { TradeRecord, SellType, BenchmarkConfig } from '../types/stock';
import Link from 'next/link';

/* ── 유틸리티 ── */
function formatKRW(n: number): string {
  return n.toLocaleString('ko-KR');
}

function formatPct(n: number, digits = 2): string {
  return `${n.toFixed(digits)}%`;
}

function pnlColor(n: number): string {
  if (n > 0) return 'text-red-600';
  if (n < 0) return 'text-blue-600';
  return 'text-gray-500';
}

function pnlBg(n: number): string {
  if (n > 0) return 'bg-red-50';
  if (n < 0) return 'bg-blue-50';
  return '';
}

const SELL_TYPES: SellType[] = [
  '전량매도', '스탑로스', '손절', '트레일링스탑', '부분매도', '시스템청산', '기타',
];

/* ── 새 거래 입력 폼 ── */
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

      {/* 프리뷰 */}
      {form.entryPrice && form.exitPrice && form.quantity && (
        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-gray-500">투자금: </span>
              <span className="font-medium">{formatKRW(Number(form.entryPrice) * Number(form.quantity))}원</span>
            </div>
            <div>
              <span className="text-gray-500">손익금액: </span>
              <span className={`font-medium ${pnlColor((Number(form.exitPrice) - Number(form.entryPrice)) * Number(form.quantity))}`}>
                {formatKRW((Number(form.exitPrice) - Number(form.entryPrice)) * Number(form.quantity))}원
              </span>
            </div>
            <div>
              <span className="text-gray-500">수익률: </span>
              <span className={`font-medium ${pnlColor(Number(form.exitPrice) - Number(form.entryPrice))}`}>
                {formatPct(((Number(form.exitPrice) - Number(form.entryPrice)) / Number(form.entryPrice)) * 100)}
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

/* ── 벤치마크 설정 패널 ── */
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
            <div className={`text-lg font-semibold ${pnlColor(summary.currentSeed - benchmark.initialSeed)}`}>
              {formatKRW(summary.currentSeed)}원
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">실현수익</div>
            <div className={`text-lg font-semibold ${pnlColor(summary.totalPnl)}`}>
              {summary.totalPnl >= 0 ? '+' : ''}{formatKRW(summary.totalPnl)}원
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">트레이드 성과</div>
            <div className={`text-lg font-semibold ${pnlColor(summary.totalPnlPct)}`}>
              {summary.totalPnlPct >= 0 ? '+' : ''}{formatPct(summary.totalPnlPct)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 요약 카드 ── */
function SummaryCards({ summary }: { summary: NonNullable<ReturnType<typeof useTrades>['data']>['summary'] }) {
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
        <div className="text-xl font-semibold">{formatPct(summary.winRate)}</div>
      </div>
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="text-xs text-gray-500 mb-1">평균 수익률</div>
        <div className={`text-xl font-semibold ${pnlColor(summary.avgPnlPct)}`}>{formatPct(summary.avgPnlPct)}</div>
      </div>
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="text-xs text-gray-500 mb-1">최대 수익 / 손실</div>
        <div className="text-sm font-semibold">
          <span className="text-red-600">{formatPct(summary.maxWinPct)}</span>
          <span className="text-gray-300 mx-1">/</span>
          <span className="text-blue-600">{formatPct(summary.maxLossPct)}</span>
        </div>
      </div>
    </div>
  );
}

/* ── 메인 페이지 ── */
export default function TradesPage() {
  const { data, loading, error, addTrade, removeTrade, updateBenchmark, refresh } = useTrades();
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleAddTrade = async (trade: Parameters<typeof addTrade>[0]) => {
    try {
      await addTrade(trade);
      setShowForm(false);
    } catch {
      // error handled in hook
    }
  };

  const handleDelete = async (id: string) => {
    await removeTrade(id);
    setDeleteConfirm(null);
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* ── 네비게이션 ── */}
      <nav className="fixed top-0 w-full bg-[#1d1d1f]/95 backdrop-blur-xl z-50">
        <div className="max-w-[980px] mx-auto px-6 h-11 flex items-center">
          <Link href="/" className="text-white text-xl font-semibold tracking-tight">
            OURTLE
          </Link>
          <div className="flex items-center gap-7 ml-8">
            <Link href="/" className="text-xs tracking-wide text-white/70 hover:text-white transition-colors">Home</Link>
            <Link href="/watchlist" className="text-xs tracking-wide text-white/70 hover:text-white transition-colors">Dennis</Link>
            <Link href="/trades" className="text-xs tracking-wide text-white font-medium transition-colors">Trade Log</Link>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <button onClick={() => refresh()} className="text-xs text-[#86868b] hover:text-white transition-colors" title="새로고침">↻</button>
          </div>
        </div>
      </nav>

      {/* ── 본문 ── */}
      <main className="pt-16 pb-12 px-6">
        <div className="max-w-[980px] mx-auto">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Trade Log</h1>
              <p className="text-sm text-gray-500 mt-1">매매 기록 및 성과 추적</p>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-5 py-2.5 bg-gray-900 text-white text-sm rounded-xl hover:bg-gray-800 transition-colors"
            >
              + 새 기록
            </button>
          </div>

          {/* 에러 */}
          {error && (
            <div className="bg-red-50 text-red-700 text-sm rounded-xl p-4 mb-6">{error}</div>
          )}

          {/* 로딩 */}
          {loading && !data && (
            <div className="text-center py-20 text-gray-400 text-sm">로딩 중...</div>
          )}

          {data && (
            <>
              {/* 요약 카드 */}
              <SummaryCards summary={data.summary} />

              {/* 벤치마크 */}
              <div className="mb-6">
                <BenchmarkPanel
                  benchmark={data.benchmark}
                  summary={data.summary}
                  onUpdate={updateBenchmark}
                />
              </div>

              {/* 입력 폼 */}
              {showForm && (
                <TradeForm onSubmit={handleAddTrade} onCancel={() => setShowForm(false)} />
              )}

              {/* 거래 기록 테이블 */}
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h3 className="text-base font-semibold text-gray-900">거래 내역</h3>
                </div>

                {data.trades.length === 0 ? (
                  <div className="text-center py-16 text-gray-400 text-sm">
                    아직 기록된 거래가 없습니다.
                    <br />
                    <button onClick={() => setShowForm(true)} className="text-gray-600 underline mt-2 inline-block">
                      첫 거래를 기록해보세요
                    </button>
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
                            className={`border-t border-gray-50 hover:bg-gray-50/50 transition-colors ${pnlBg(trade.pnlAmount)}`}
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
                            <td className={`px-4 py-3 text-right font-semibold ${pnlColor(trade.pnlPct)}`}>
                              {trade.pnlPct >= 0 ? '+' : ''}{formatPct(trade.pnlPct)}
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
                            <td className={`px-4 py-3 text-right font-medium ${pnlColor(trade.pnlAmount)}`}>
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
      </main>

      {/* 푸터 */}
      <footer className="py-6 text-center text-xs text-gray-400">
        OURTLE &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
