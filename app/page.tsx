'use client';

import { useEffect, useState } from 'react';

interface Stock {
  code: string;
  name: string;
  close: number;
  rsi: number;
  volume: number;
  volume_change_pct: number;
  trading_value: number;
}

interface ScanResult {
  trading_date: string;
  market_rsi: {
    kospi: number | null;
    kosdaq: number | null;
  };
  total_found: number;
  stocks: Stock[];
}

export default function Home() {
  const [scanData, setScanData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStocks = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/stocks/scan?max_results=6');
      const data = await response.json();
      setScanData(data);
    } catch (error) {
      console.error('Failed to fetch stocks:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-xl z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="text-2xl font-semibold tracking-tight">Unimind</div>
          <div className="flex gap-8 text-sm">
            <a href="#" className="text-gray-600 hover:text-black transition-colors">대시보드</a>
            <a href="#" className="text-gray-600 hover:text-black transition-colors">분석</a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-7xl font-bold tracking-tight mb-6 bg-gradient-to-br from-gray-900 to-gray-600 bg-clip-text text-transparent">
            52주 신고가를
            <br />
            추적하는 가장
            <br />
            스마트한 방법
          </h1>
          <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto leading-relaxed">
            시가총액 상위 1,000개 종목을 실시간으로 분석하여
            <br />
            가장 강력한 추세를 발견합니다
          </p>
          <button
            onClick={fetchStocks}
            disabled={loading}
            className="bg-black text-white px-8 py-4 rounded-full text-lg font-medium hover:bg-gray-800 transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '분석 중...' : '오늘의 신고가 보기'}
          </button>
        </div>
      </section>

      {/* Market RSI */}
      {scanData && (
        <section className="py-12 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-50 rounded-3xl p-8 hover:bg-gray-100 transition-colors">
                <div className="text-sm text-gray-500 mb-2">거래일</div>
                <div className="text-3xl font-semibold">{scanData.trading_date}</div>
              </div>
              <div className="bg-gray-50 rounded-3xl p-8 hover:bg-gray-100 transition-colors">
                <div className="text-sm text-gray-500 mb-2">코스피 RSI</div>
                <div className="text-3xl font-semibold">
                  {scanData.market_rsi.kospi?.toFixed(1) || 'N/A'}
                </div>
              </div>
              <div className="bg-gray-50 rounded-3xl p-8 hover:bg-gray-100 transition-colors">
                <div className="text-sm text-gray-500 mb-2">코스닥 RSI</div>
                <div className="text-3xl font-semibold">
                  {scanData.market_rsi.kosdaq?.toFixed(1) || 'N/A'}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Stocks Grid */}
      {scanData && scanData.stocks.length > 0 && (
        <section className="py-20 px-6">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-5xl font-bold mb-4 text-center">오늘의 선별 종목</h2>
            <p className="text-center text-gray-600 mb-16 text-lg">
              총 {scanData.total_found}개 발견
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {scanData.stocks.map((stock, index) => (
                <div
                  key={stock.code}
                  className="group bg-white border border-gray-200 rounded-3xl p-8 hover:shadow-2xl hover:scale-105 transition-all duration-500 cursor-pointer"
                  style={{
                    animationDelay: `${index * 0.1}s`,
                    animation: 'fadeInUp 0.6s ease-out forwards',
                    opacity: 0,
                  }}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-2xl font-bold mb-1">{stock.name}</h3>
                      <p className="text-sm text-gray-500">{stock.code}</p>
                    </div>
                    <div className="bg-black text-white px-3 py-1 rounded-full text-sm font-medium">
                      신고가
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="text-sm text-gray-500 mb-1">종가</div>
                      <div className="text-3xl font-bold">
                        {stock.close.toLocaleString()}원
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-gray-500 mb-1">RSI</div>
                        <div className="text-xl font-semibold">{stock.rsi.toFixed(1)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500 mb-1">거래량 변화</div>
                        <div className={`text-xl font-semibold ${stock.volume_change_pct > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                          {stock.volume_change_pct > 0 ? '+' : ''}
                          {stock.volume_change_pct.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-sm text-gray-500 mb-1">거래대금</div>
                      <div className="text-lg font-medium">
                        {(stock.trading_value / 100000000).toFixed(1)}억원
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Empty State */}
      {!scanData && !loading && (
        <section className="py-32 px-6">
          <div className="max-w-2xl mx-auto text-center">
            <div className="text-6xl mb-6">📊</div>
            <h3 className="text-3xl font-bold mb-4">데이터를 불러와주세요</h3>
            <p className="text-gray-600 text-lg">
              상단의 버튼을 클릭하여 오늘의 52주 신고가 종목을 확인하세요
            </p>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-16 px-6 border-t border-gray-100">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-gray-500">
            © 2026 Unimind. 시가총액 상위 1,000개 종목 분석.
          </p>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
