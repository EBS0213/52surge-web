/**
 * 터틀 트레이딩 계산 유틸리티
 *
 * 엑셀 베팅계산_스탁이지 시트의 로직을 코드로 구현
 * - N값 (20일 ATR) 계산
 * - 유닛 수량 및 금액 계산
 * - 손절가, 손익비, 포지션 비중 등
 * - 시스템1/2 진입·청산 시그널 판정
 */

import type { ChartCandle, TurtleSettings, TurtleSystem } from '../types/stock';

/** 기본 터틀 설정값 */
export const DEFAULT_TURTLE_SETTINGS: TurtleSettings = {
  accountTotal: 45_000_000,
  riskPct: 0.02,
  stopPct: 0.07,
  winRate: 0.3,
  marketCondition: 3,
  currentMarket: 2,
  maxUnits: 5,
  deployedUnits: 5,
};

/**
 * N값 (20일 ATR) 계산
 * True Range = max(고가-저가, |고가-전일종가|, |저가-전일종가|)
 * N = 20일 True Range 이동평균
 */
export function calculateN(candles: ChartCandle[]): number {
  if (candles.length < 2) return 0;

  const trValues: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trValues.push(tr);
  }

  // 최근 20일 ATR
  const period = Math.min(20, trValues.length);
  const recent = trValues.slice(-period);
  return recent.reduce((sum, v) => sum + v, 0) / recent.length;
}

/**
 * 1회 투입금액 계산
 * = 계좌총액 * R / 손절% * (현재시장/시장장세) * (투입유닛/Unit)
 */
export function calculateBetAmount(settings: TurtleSettings): number {
  const { accountTotal, riskPct, stopPct, currentMarket, marketCondition, deployedUnits, maxUnits } = settings;
  return (accountTotal * riskPct / stopPct) * (currentMarket / marketCondition) * (deployedUnits / maxUnits);
}

/**
 * 유닛 수량 계산 (진입수량)
 * 엑셀에서는 수동 입력이지만, 여기서는 1회투입금액/매수가로 자동 계산
 */
export function calculateUnitSize(betAmount: number, entryPrice: number): number {
  if (entryPrice <= 0) return 0;
  return Math.floor(betAmount / entryPrice);
}

/**
 * 손절가 계산
 * = ROUND(매수가 - 매수가 * Stop%, -1)  (10원 단위 반올림)
 */
export function calculateStopPrice(entryPrice: number, stopPct: number): number {
  return Math.round((entryPrice - entryPrice * stopPct) / 10) * 10;
}

/**
 * 주당 리스크 (Risk/share)
 * = 매수가 - 손절가
 */
export function calculateRiskPerShare(entryPrice: number, stopPrice: number): number {
  return entryPrice - stopPrice;
}

/**
 * 베팅액 (P)
 * = 매수가 * 진입수량
 */
export function calculatePositionAmount(entryPrice: number, unitSize: number): number {
  return entryPrice * unitSize;
}

/**
 * 포지션 비중 P(%)
 * = 베팅액 / 계좌총액
 */
export function calculatePositionPct(positionAmount: number, accountTotal: number): number {
  if (accountTotal <= 0) return 0;
  return positionAmount / accountTotal;
}

/**
 * 2R 수익률 계산
 * = (2% 금액) / 베팅액 / 6 / 투입유닛
 * 2% 금액 = 계좌총액 * R
 */
export function calculate2RPct(settings: TurtleSettings, positionAmount: number): number {
  if (positionAmount <= 0) return 0;
  const riskAmount = settings.accountTotal * settings.riskPct;
  return riskAmount / positionAmount / 6 / settings.deployedUnits;
}

/**
 * 조정 스탑 계산
 * = ROUND((매수가*(1+2R수익률))*(1-손절%), -1)
 */
export function calculateAdjustedStop(entryPrice: number, twoRPct: number, stopPct: number): number {
  return Math.round((entryPrice * (1 + twoRPct)) * (1 - stopPct) / 10) * 10;
}

/**
 * 손익비 (RRR)
 * = 2R수익률 / 손절%
 */
export function calculateRRR(twoRPct: number, stopPct: number): number {
  if (stopPct <= 0) return 0;
  return twoRPct / stopPct;
}

/**
 * 수익률 계산
 */
export function calculatePnlPct(currentPrice: number, entryPrice: number): number {
  if (entryPrice <= 0) return 0;
  return (currentPrice - entryPrice) / entryPrice;
}

/**
 * 켈리 베팅 비율 계산
 * = 승률 - (1-승률) / 손익비
 */
export function calculateKelly(winRate: number, rrr: number): number {
  if (rrr <= 0) return 0;
  return winRate - (1 - winRate) / rrr;
}

// ── 터틀 시스템 시그널 판정 ──

/**
 * N일 최고가 계산
 */
export function getHighN(candles: ChartCandle[], n: number): number {
  const recent = candles.slice(-n);
  return Math.max(...recent.map((c) => c.high));
}

/**
 * N일 최저가 계산
 */
export function getLowN(candles: ChartCandle[], n: number): number {
  const recent = candles.slice(-n);
  return Math.min(...recent.map((c) => c.low));
}

/**
 * 시스템1 진입 시그널: 현재가 > 20일 최고가 돌파
 */
export function isSystem1Entry(currentPrice: number, candles: ChartCandle[]): boolean {
  if (candles.length < 20) return false;
  // 오늘 제외, 이전 20일 최고가
  const prevCandles = candles.slice(-21, -1);
  const high20 = getHighN(prevCandles, 20);
  return currentPrice > high20;
}

/**
 * 시스템1 청산 시그널: 현재가 < 10일 최저가 이탈
 */
export function isSystem1Exit(currentPrice: number, candles: ChartCandle[]): boolean {
  if (candles.length < 10) return false;
  const prevCandles = candles.slice(-11, -1);
  const low10 = getLowN(prevCandles, 10);
  return currentPrice < low10;
}

/**
 * 시스템2 진입 시그널: 현재가 > 55일 최고가 돌파
 */
export function isSystem2Entry(currentPrice: number, candles: ChartCandle[]): boolean {
  if (candles.length < 55) return false;
  const prevCandles = candles.slice(-56, -1);
  const high55 = getHighN(prevCandles, 55);
  return currentPrice > high55;
}

/**
 * 시스템2 청산 시그널: 현재가 < 20일 최저가 이탈
 */
export function isSystem2Exit(currentPrice: number, candles: ChartCandle[]): boolean {
  if (candles.length < 20) return false;
  const prevCandles = candles.slice(-21, -1);
  const low20 = getLowN(prevCandles, 20);
  return currentPrice < low20;
}

/**
 * 매도 시그널 판정
 * - 시스템1: 10일 최저가 이탈 또는 손절가 이탈
 * - 시스템2: 20일 최저가 이탈 또는 손절가 이탈
 * - 공통: 14거래일 경과
 */
export function checkSellSignal(
  system: TurtleSystem,
  currentPrice: number,
  stopPrice: number,
  tradingDays: number,
  candles: ChartCandle[]
): { signal: boolean; reason?: string } {
  // 14거래일 경과
  if (tradingDays >= 14) {
    return { signal: true, reason: '14거래일 경과' };
  }

  // 손절가 이탈
  if (currentPrice <= stopPrice) {
    return { signal: true, reason: '손절가 이탈' };
  }

  // 시스템별 청산 시그널
  if (system === 'system1' && isSystem1Exit(currentPrice, candles)) {
    return { signal: true, reason: '10일 최저가 이탈 (시스템1)' };
  }
  if (system === 'system2' && isSystem2Exit(currentPrice, candles)) {
    return { signal: true, reason: '20일 최저가 이탈 (시스템2)' };
  }

  return { signal: false };
}

/**
 * 거래일 수 계산 (주말 제외, 공휴일 미포함)
 */
export function countTradingDays(fromDate: string, toDate: string): number {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  let count = 0;
  const current = new Date(from);
  current.setDate(current.getDate() + 1); // 다음날부터 카운트

  while (current <= to) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * 종합 포지션 계산
 */
export function calculatePosition(
  entryPrice: number,
  currentPrice: number,
  settings: TurtleSettings
) {
  const betAmount = calculateBetAmount(settings);
  const unitSize = calculateUnitSize(betAmount, entryPrice);
  const stopPrice = calculateStopPrice(entryPrice, settings.stopPct);
  const riskPerShare = calculateRiskPerShare(entryPrice, stopPrice);
  const positionAmount = calculatePositionAmount(entryPrice, unitSize);
  const positionPct = calculatePositionPct(positionAmount, settings.accountTotal);
  const twoRPct = calculate2RPct(settings, positionAmount);
  const rrr = calculateRRR(twoRPct, settings.stopPct);
  const pnlPct = calculatePnlPct(currentPrice, entryPrice);

  return {
    betAmount,
    unitSize,
    stopPrice,
    riskPerShare,
    positionAmount,
    positionPct,
    twoRPct,
    rrr,
    pnlPct,
  };
}
