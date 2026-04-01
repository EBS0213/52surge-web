/**
 * 한국투자증권 OpenAPI 클라이언트
 *
 * 사용 전 .env.local에 다음 환경변수를 설정하세요:
 *   KIS_APP_KEY=your_app_key
 *   KIS_APP_SECRET=your_app_secret
 *   KIS_BASE_URL=https://openapi.koreainvestment.com:9443  (실전)
 *     또는 https://openapivts.koreainvestment.com:29443 (모의)
 */

const BASE_URL = process.env.KIS_BASE_URL || 'https://openapi.koreainvestment.com:9443';
const APP_KEY = process.env.KIS_APP_KEY || '';
const APP_SECRET = process.env.KIS_APP_SECRET || '';

// 토큰 캐시
let tokenCache: { token: string; expiresAt: number } | null = null;

/** 접근 토큰 발급 */
export async function getAccessToken(): Promise<string> {
  // 캐시된 토큰이 유효하면 재사용
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const res = await fetch(`${BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: APP_KEY,
      appsecret: APP_SECRET,
    }),
  });

  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 86400) * 1000,
  };
  return tokenCache.token;
}

/** 공통 헤더 생성 */
async function makeHeaders(trId: string) {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json; charset=utf-8',
    authorization: `Bearer ${token}`,
    appkey: APP_KEY,
    appsecret: APP_SECRET,
    tr_id: trId,
    custtype: 'P',
  };
}

/** 국내 주식 현재가 조회 (FHKST01010100) */
export async function getCurrentPrice(stockCode: string) {
  const headers = await makeHeaders('FHKST01010100');
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: stockCode,
  });

  const res = await fetch(
    `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?${params}`,
    { headers, cache: 'no-store' }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Price request failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.output;
}

/** 국내 주식 기간별 시세 (일/주/월봉) - FHKST03010100 */
export async function getDailyChart(
  stockCode: string,
  startDate: string, // YYYYMMDD
  endDate: string,    // YYYYMMDD
  periodCode: 'D' | 'W' | 'M' = 'D'
) {
  const headers = await makeHeaders('FHKST03010100');
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: stockCode,
    FID_INPUT_DATE_1: startDate,
    FID_INPUT_DATE_2: endDate,
    FID_PERIOD_DIV_CODE: periodCode,
    FID_ORG_ADJ_PRC: '0', // 수정주가 반영
  });

  const res = await fetch(
    `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${params}`,
    { headers, cache: 'no-store' }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Chart request failed: ${res.status} ${body}`);
  }
  const data = await res.json();

  // output2 배열을 차트 데이터로 변환
  return (data.output2 || []).map((item: Record<string, string>) => ({
    date: item.stck_bsop_date, // YYYYMMDD
    open: Number(item.stck_oprc),
    high: Number(item.stck_hgpr),
    low: Number(item.stck_lwpr),
    close: Number(item.stck_clpr),
    volume: Number(item.acml_vol),
  })).reverse(); // 오래된 날짜부터 정렬
}

// ───────────────────────────────────────────────
// 추가 API 함수들
// ───────────────────────────────────────────────

/** KIS 응답에서 배열 데이터 추출 (output, output1, output2 중 첫 배열) */
function extractItems(data: Record<string, unknown>): Record<string, string>[] {
  if (data.rt_cd !== '0') {
    console.error(`[KIS] API error: rt_cd=${data.rt_cd}, msg=${data.msg1 || data.msg_cd}`);
    return [];
  }
  for (const key of ['output', 'output1', 'output2']) {
    if (Array.isArray(data[key]) && (data[key] as unknown[]).length > 0) {
      return data[key] as Record<string, string>[];
    }
  }
  console.log('[KIS] No array found in response keys:', Object.keys(data));
  return [];
}

/** 순위 항목 파싱 (공통) */
function parseRankItem(item: Record<string, string>) {
  return {
    rank: Number(item.data_rank || 0),
    code: item.mksc_shrn_iscd || item.stck_shrn_iscd || '',
    name: item.hts_kor_isnm || '',
    price: Number(item.stck_prpr || 0),
    change: Number(item.prdy_vrss || 0),
    changeRate: Number(item.prdy_ctrt || 0),
    volume: Number(item.acml_vol || 0),
    tradingValue: Number(item.acml_tr_pbmn || 0),
  };
}

/** 거래량 순위 (FHPST01710000) */
export async function getVolumeRank(marketCode: string = 'J') {
  const headers = await makeHeaders('FHPST01710000');
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: marketCode,
    FID_COND_SCR_DIV_CODE: '20101',
    FID_INPUT_ISCD: '0000',
    FID_DIV_CLS_CODE: '0',
    FID_BLNG_CLS_CODE: '0',
    FID_TRGT_CLS_CODE: '111111111',
    FID_TRGT_EXLS_CLS_CODE: '000000',
    FID_INPUT_PRICE_1: '',
    FID_INPUT_PRICE_2: '',
    FID_VOL_CNT: '',
    FID_INPUT_DATE_1: '',
  });

  const res = await fetch(
    `${BASE_URL}/uapi/domestic-stock/v1/quotations/volume-rank?${params}`,
    { headers, cache: 'no-store' }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[KIS] Volume rank HTTP ${res.status}: ${body.slice(0, 200)}`);
    throw new Error(`Volume rank failed: ${res.status}`);
  }
  const data = await res.json();
  const items = extractItems(data);
  console.log(`[KIS] Volume rank: ${items.length} items`);
  return items.slice(0, 30).map(parseRankItem);
}

/** 등락률 순위 (FHPST01700000) */
export async function getFluctuationRank(direction: 'up' | 'down' = 'up', marketCode: string = 'J') {
  const headers = await makeHeaders('FHPST01700000');
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: marketCode,
    FID_COND_SCR_DIV_CODE: '20170',
    FID_INPUT_ISCD: '0000',
    FID_RANK_SORT_CLS_CODE: direction === 'up' ? '0' : '1',
    FID_INPUT_CNT_1: '0',
    FID_PRC_CLS_CODE: '0',
    FID_INPUT_PRICE_1: '',
    FID_INPUT_PRICE_2: '',
    FID_VOL_CNT: '',
    FID_TRGT_CLS_CODE: '0',
    FID_TRGT_EXLS_CLS_CODE: '0',
    FID_DIV_CLS_CODE: '0',
    FID_RSFL_RATE1: '',
    FID_RSFL_RATE2: '',
  });

  const res = await fetch(
    `${BASE_URL}/uapi/domestic-stock/v1/ranking/fluctuation?${params}`,
    { headers, cache: 'no-store' }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[KIS] Fluctuation rank HTTP ${res.status}: ${body.slice(0, 200)}`);
    throw new Error(`Fluctuation rank failed: ${res.status}`);
  }
  const data = await res.json();
  const items = extractItems(data);
  console.log(`[KIS] Fluctuation rank (${direction}): ${items.length} items`);
  return items.slice(0, 30).map(parseRankItem);
}

/** 종목별 투자자 매매동향 (FHKST01010900) */
export async function getStockInvestor(stockCode: string) {
  const headers = await makeHeaders('FHKST01010900');
  const today = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: stockCode,
  });

  const res = await fetch(
    `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-investor?${params}`,
    { headers, cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Stock investor failed: ${res.status}`);
  const data = await res.json();
  const items = data.output || [];
  if (items.length === 0) return null;

  // 첫 번째 항목 = 당일 데이터
  const today_data = items[0];
  return {
    date: today_data.stck_bsop_date,
    frgn: Number(today_data.frgn_ntby_qty || 0),        // 외국인 순매수 수량
    inst: Number(today_data.orgn_ntby_qty || 0),         // 기관 순매수 수량
    prsn: Number(today_data.prsn_ntby_qty || 0),         // 개인 순매수 수량
    frgnValue: Number(today_data.frgn_ntby_tr_pbmn || 0), // 외국인 순매수 금액
    instValue: Number(today_data.orgn_ntby_tr_pbmn || 0), // 기관 순매수 금액
    prsnValue: Number(today_data.prsn_ntby_tr_pbmn || 0), // 개인 순매수 금액
  };
}

/** 신고가/신저가 근접 종목 (FHPST01760000) */
export async function getNearHighLow(type: 'high' | 'low' = 'high', marketCode: string = 'J') {
  const headers = await makeHeaders('FHPST01760000');
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: marketCode,
    FID_COND_SCR_DIV_CODE: '21301',
    FID_INPUT_ISCD: '0000',
    FID_RANK_SORT_CLS_CODE: type === 'high' ? '0' : '1',
    FID_INPUT_CNT_1: '0',
    FID_PRC_CLS_CODE: '0',
    FID_INPUT_PRICE_1: '',
    FID_INPUT_PRICE_2: '',
    FID_VOL_CNT: '',
    FID_TRGT_CLS_CODE: '0',
    FID_TRGT_EXLS_CLS_CODE: '0',
    FID_DIV_CLS_CODE: '0',
    FID_RSFL_RATE1: '',
    FID_RSFL_RATE2: '',
  });

  const res = await fetch(
    `${BASE_URL}/uapi/domestic-stock/v1/ranking/near-new-highlow?${params}`,
    { headers, cache: 'no-store' }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[KIS] Near highlow HTTP ${res.status}: ${body.slice(0, 200)}`);
    throw new Error(`Near high/low failed: ${res.status}`);
  }
  const data = await res.json();
  const items = extractItems(data);
  console.log(`[KIS] Near highlow (${type}): ${items.length} items`);
  return items.slice(0, 30).map(parseRankItem);
}

/** 한투 API 설정 여부 확인 */
export function isKISConfigured(): boolean {
  return !!(APP_KEY && APP_SECRET);
}
