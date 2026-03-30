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

/** 국내 주식 기간별 시세 (일봉) - FHKST03010100 */
export async function getDailyChart(
  stockCode: string,
  startDate: string, // YYYYMMDD
  endDate: string     // YYYYMMDD
) {
  const headers = await makeHeaders('FHKST03010100');
  const params = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: stockCode,
    FID_INPUT_DATE_1: startDate,
    FID_INPUT_DATE_2: endDate,
    FID_PERIOD_DIV_CODE: 'D',
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

/** 한투 API 설정 여부 확인 */
export function isKISConfigured(): boolean {
  return !!(APP_KEY && APP_SECRET);
}
