export interface Stock {
  code: string;
  name: string;
  close: number;
  rsi: number;
  volume: number;
  volume_change_pct: number;
  trading_value: number;
}

export interface ScanResult {
  trading_date: string;
  market_rsi: {
    kospi: number | null;
    kosdaq: number | null;
  };
  total_found: number;
  stocks: Stock[];
}

export interface KISTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface KISCurrentPrice {
  stck_prpr: string;    // 현재가
  prdy_vrss: string;    // 전일 대비
  prdy_ctrt: string;    // 전일 대비율
  acml_vol: string;     // 누적 거래량
  acml_tr_pbmn: string; // 누적 거래대금
  stck_oprc: string;    // 시가
  stck_hgpr: string;    // 고가
  stck_lwpr: string;    // 저가
}

export interface ChartCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── 터틀 트레이딩 워치리스트 ──

/** 터틀 트레이딩 시스템 구분 */
export type TurtleSystem = 'system1' | 'system2';

/** 터틀 트레이딩 설정값 */
export interface TurtleSettings {
  accountTotal: number;       // 계좌총액
  riskPct: number;            // R (리스크 비율, 예: 0.02 = 2%)
  stopPct: number;            // 손절 비율 (예: 0.07 = 7%)
  winRate: number;            // 승률 (예: 0.3 = 30%)
  marketCondition: number;    // 시장장세 (1~3)
  currentMarket: number;      // 현재시장 (1~3)
  maxUnits: number;           // Unit (최대 유닛)
  deployedUnits: number;      // 투입유닛
}

/** 워치리스트 종목 정보 */
export interface WatchlistStock {
  code: string;
  name: string;
  system: TurtleSystem;       // 시스템1 or 시스템2
  entryDate: string;          // 편입 날짜 (YYYY-MM-DD)
  entryPrice: number;         // 편입 시 가격 (돌파가)
  currentPrice: number;       // 현재가
  high20d: number;            // 20일 최고가 (시스템1 진입)
  low10d: number;             // 10일 최저가 (시스템1 청산)
  high55d: number;            // 55일 최고가 (시스템2 진입)
  low20d: number;             // 20일 최저가 (시스템2 청산)
  nValue: number;             // N값 (20일 ATR)
  unitSize: number;           // 유닛 수량 (진입수량)
  unitAmount: number;         // 유닛 금액 (베팅액)
  stopPrice: number;          // 손절가
  riskPerShare: number;       // 주당 리스크
  positionPct: number;        // 포트폴리오 비중 (%)
  rrr: number;                // 손익비 (Risk/Reward Ratio)
  pnlPct: number;             // 수익률 (%)
  tradingDays: number;        // 편입 후 거래일 수
  sellSignal: boolean;        // 매도 시그널 여부
  sellReason?: string;        // 매도 사유
}

/** 워치리스트 API 응답 */
export interface WatchlistResult {
  settings: TurtleSettings;
  stocks: WatchlistStock[];
  lastUpdated: string;
}

/** 워치리스트 저장 상태 */
export interface WatchlistState {
  settings: TurtleSettings;
  entries: WatchlistEntry[];
}

/** 편입 엔트리 (서버 저장용) */
export interface WatchlistEntry {
  code: string;
  name: string;
  system: TurtleSystem;
  entryDate: string;
  entryPrice: number;
}

/** 아카이브 엔트리 (편출 후 3주 보관) */
export interface ArchivedEntry {
  code: string;
  name: string;
  system: TurtleSystem;
  entryDate: string;          // 원래 편입일
  entryPrice: number;         // 원래 편입가
  archivedAt: string;         // 아카이브 날짜 (YYYY-MM-DD)
  sellReason: string;         // 편출 사유
}

// ── 트레이드 기록 (매매일지) ──

/** 매도 유형 */
export type SellType =
  | '전량매도'
  | '스탑로스'
  | '손절'
  | '트레일링스탑'
  | '부분매도'
  | '시스템청산'
  | '기타';

/** 트레이드 기록 */
export interface TradeRecord {
  id: string;                 // 고유 ID
  stockName: string;          // 종목명
  stockCode: string;          // 종목코드
  source: string;             // 출처 워치리스트 (Dennis, 등)
  entryDate: string;          // 진입일 (YYYY-MM-DD)
  exitDate: string;           // 청산일 (YYYY-MM-DD)
  entryPrice: number;         // 진입가
  exitPrice: number;          // 청산가
  quantity: number;           // 수량
  investAmount: number;       // 투자금
  pnlAmount: number;          // 손익금액
  pnlPct: number;             // 수익률 (%)
  sellType: SellType;         // 매도유형
  sellReason?: string;        // 매도사유 (상세)
  units: number;              // 유닛수
  currentSeed: number;        // 현재시드
  memo?: string;              // 메모
  createdAt: string;          // 기록일시
}

/** 벤치마크 설정 */
export interface BenchmarkConfig {
  indexName: string;           // 벤치마크 지수명 (코스닥 등)
  startDate: string;          // 시작일
  endDate: string;            // 종료일
  initialSeed: number;        // 최초시드
}

/** 트레이드 기록 API 응답 */
export interface TradesResult {
  trades: TradeRecord[];
  benchmark: BenchmarkConfig;
  summary: TradeSummary;
}

/** 트레이드 요약 통계 */
export interface TradeSummary {
  totalTrades: number;        // 총 거래수
  winCount: number;           // 승 횟수
  loseCount: number;          // 패 횟수
  winRate: number;            // 실제 승률 (%)
  totalPnl: number;           // 총 실현수익
  totalPnlPct: number;        // 총 수익률 (%)
  currentSeed: number;        // 현재시드
  avgPnlPct: number;          // 평균 수익률 (%)
  maxWinPct: number;          // 최대 수익률 (%)
  maxLossPct: number;         // 최대 손실률 (%)
}
