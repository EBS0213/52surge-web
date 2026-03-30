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
