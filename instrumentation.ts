/**
 * Next.js Instrumentation — 서버 시작 시 캐시 워밍업
 * 이 파일의 register()는 서버 인스턴스 생성 시 1회 호출됨
 */

export async function register() {
  // Node.js 런타임에서만 실행 (Edge 제외)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const port = process.env.PORT || 3000;
    const baseUrl = `http://localhost:${port}`;

    console.log('[warmup] 서버 시작, 캐시 워밍업 예약...');

    // 서버가 완전히 시작된 후 API를 호출하여 캐시 채우기
    setTimeout(async () => {
      try {
        console.log('[warmup] 캐시 워밍업 시작...');

        // 병렬로 두 API 호출
        const [marketRes, scanRes] = await Promise.allSettled([
          fetch(`${baseUrl}/api/market?period=daily`).then((r) => r.ok ? 'OK' : `ERR:${r.status}`),
          fetch(`${baseUrl}/api/stocks/scan?max_results=20`).then((r) => r.ok ? 'OK' : `ERR:${r.status}`),
        ]);

        console.log(
          `[warmup] 완료 — market: ${marketRes.status === 'fulfilled' ? marketRes.value : 'failed'}, scan: ${scanRes.status === 'fulfilled' ? scanRes.value : 'failed'}`
        );
      } catch (err) {
        console.log('[warmup] 워밍업 실패 (다음 요청 시 캐시 생성):', err);
      }
    }, 5000); // 서버 시작 5초 후
  }
}
