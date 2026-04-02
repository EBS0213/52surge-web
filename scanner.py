"""
52주 신고가 스캔 - 최적화 버전
시가총액 상위 2000개 + 병렬 처리
"""

import pandas as pd
from datetime import datetime, timedelta
import FinanceDataReader as fdr
from typing import Optional, Dict
from multiprocessing import Pool, cpu_count
import warnings
warnings.filterwarnings('ignore')


def get_last_trading_day():
    """최근 거래일 찾기"""
    today = datetime.now()

    for i in range(10):
        check_date = today - timedelta(days=i)

        if check_date.weekday() >= 5:
            continue

        try:
            df = fdr.DataReader('005930', check_date, check_date)
            if len(df) > 0:
                print(f"✅ 최근 거래일: {check_date.strftime('%Y-%m-%d')} ({['월','화','수','목','금','토','일'][check_date.weekday()]}요일)")
                return check_date
        except:
            continue

    return today


def calculate_rsi(prices, period=14):
    """RSI 계산"""
    if len(prices) < period + 1:
        return None

    deltas = prices.diff()
    gains = deltas.where(deltas > 0, 0)
    losses = -deltas.where(deltas < 0, 0)

    avg_gain = gains.rolling(window=period).mean()
    avg_loss = losses.rolling(window=period).mean()

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))

    return rsi.iloc[-1] if not pd.isna(rsi.iloc[-1]) else None


def get_market_rsi(target_date=None):
    """코스피, 코스닥 RSI"""
    try:
        if target_date is None:
            target_date = get_last_trading_day()
        start_date = target_date - timedelta(days=90)

        try:
            kospi_df = fdr.DataReader('KS11', start_date, target_date)
            kospi_rsi = calculate_rsi(kospi_df['Close']) if len(kospi_df) > 15 else None
        except:
            kospi_rsi = None

        try:
            kosdaq_df = fdr.DataReader('KQ11', start_date, target_date)
            kosdaq_rsi = calculate_rsi(kosdaq_df['Close']) if len(kosdaq_df) > 15 else None
        except:
            kosdaq_rsi = None

        return kospi_rsi, kosdaq_rsi
    except:
        return None, None


def scan_single_stock(args):
    """단일 종목 스캔 (병렬 처리용)"""
    ticker, name, start_date, end_date, min_volume, min_trading_value, min_rsi = args

    try:
        df = fdr.DataReader(ticker, start_date, end_date)

        if len(df) < 20:
            return None

        high_52w = df['High'].max()
        latest = df.iloc[-1]

        today_close = latest['Close']
        today_high = latest['High']
        today_volume = latest['Volume']
        today_trading_value = today_close * today_volume

        # 52주 신고가 체크
        if today_high < high_52w:
            return None

        # 필터링
        if today_volume < min_volume or today_trading_value < min_trading_value:
            return None

        rsi = calculate_rsi(df['Close'])
        if rsi is None or rsi < min_rsi:
            return None

        # 거래량 증가율
        if len(df) >= 2:
            prev_volume = df['Volume'].iloc[-2]
            volume_change = ((today_volume - prev_volume) / prev_volume * 100) if prev_volume > 0 else 0
        else:
            volume_change = 0

        # 터틀 시스템 돌파 체크 (오늘 제외)
        prev_df = df.iloc[:-1]  # 오늘 제외한 이전 데이터
        high_20d = float(prev_df['High'].iloc[-20:].max()) if len(prev_df) >= 20 else 0
        high_55d = float(prev_df['High'].iloc[-55:].max()) if len(prev_df) >= 55 else 0
        breakout_20d = today_close > high_20d if high_20d > 0 else False
        breakout_55d = today_close > high_55d if high_55d > 0 else False

        return {
            'code': ticker,
            'name': name,
            'close': float(today_close),
            'high_52w': float(high_52w),
            'volume': int(today_volume),
            'volume_change_pct': float(volume_change),
            'trading_value': float(today_trading_value),
            'rsi': float(rsi),
            'date': df.index[-1].strftime('%Y-%m-%d'),
            'high_20d': high_20d,
            'high_55d': high_55d,
            'breakout_20d': breakout_20d,
            'breakout_55d': breakout_55d,
        }
    except:
        return None


def scan_52week_highs(
    min_volume: int = 1000000,
    min_trading_value: int = 5000000000,
    min_rsi: float = 60.0,
    max_results: Optional[int] = None
) -> Dict:
    """
    52주 신고가 스캔 - 최적화 버전
    KRX 전 종목 + 병렬 처리
    """
    try:
        print("="*60)
        print("52주 신고가 스캔 - 최적화 버전")
        print("KRX 전 종목 + 병렬 처리")
        print("="*60)

        # 최근 거래일
        last_trading_day = get_last_trading_day()
        start_date = last_trading_day - timedelta(days=365)

        # 시장 RSI
        print("\n시장 RSI 계산 중...")
        kospi_rsi, kosdaq_rsi = get_market_rsi(last_trading_day)
        kospi_text = f"{kospi_rsi:.1f}" if kospi_rsi else "N/A"
        kosdaq_text = f"{kosdaq_rsi:.1f}" if kosdaq_rsi else "N/A"
        print(f"코스피 RSI: {kospi_text}, 코스닥 RSI: {kosdaq_text}")

        # 종목 리스트
        print("\n종목 리스트 가져오는 중...")
        stock_list = fdr.StockListing('KRX')

        # 시가총액 기준 정렬
        if 'Marcap' in stock_list.columns:
            stock_list = stock_list.sort_values('Marcap', ascending=False)
        elif 'Market Cap' in stock_list.columns:
            stock_list = stock_list.sort_values('Market Cap', ascending=False)

        # 전 종목 스캔
        top_stocks = stock_list

        print(f"✅ KRX 전 종목 {len(top_stocks)}개 대상 스캔")

        # 병렬 처리용 인자 준비
        scan_args = []
        for idx, row in top_stocks.iterrows():
            ticker = row['Code']

            if 'Name' in top_stocks.columns:
                name = row['Name']
            elif 'ISU_NM' in top_stocks.columns:
                name = row['ISU_NM']
            else:
                name = ticker

            scan_args.append((
                ticker, name, start_date, last_trading_day,
                min_volume, min_trading_value, min_rsi
            ))

        # 병렬 처리
        num_processes = min(cpu_count(), 8)  # 최대 8개 프로세스
        print(f"\n🚀 {num_processes}개 프로세스로 병렬 스캔 시작...")
        print(f"총 {len(scan_args)}개 종목 분석 중...\n")

        with Pool(processes=num_processes) as pool:
            results = pool.map(scan_single_stock, scan_args)

        # None 제거
        results = [r for r in results if r is not None]

        # RSI 정렬
        if len(results) > 0:
            results_df = pd.DataFrame(results)
            results_df = results_df.sort_values('rsi', ascending=False)
            if max_results:
                results_df = results_df.head(max_results)
            results = results_df.to_dict('records')

        print(f"\n✅ 스캔 완료! 발견된 종목: {len(results)}개")

        return {
            "trading_date": last_trading_day.strftime('%Y-%m-%d'),
            "market_rsi": {
                "kospi": float(kospi_rsi) if kospi_rsi else None,
                "kosdaq": float(kosdaq_rsi) if kosdaq_rsi else None
            },
            "scan_time": datetime.now().isoformat(),
            "total_scanned": len(scan_args),
            "total_found": len(results),
            "filters": {
                "min_volume": min_volume,
                "min_trading_value": min_trading_value,
                "min_rsi": min_rsi,
                "note": "시가총액 상위 2000개 종목"
            },
            "stocks": results
        }

    except Exception as e:
        print(f"\n❌ 스캔 오류: {e}")
        import traceback
        traceback.print_exc()
        return {
            "error": str(e),
            "trading_date": None,
            "market_rsi": {"kospi": None, "kosdaq": None},
            "scan_time": datetime.now().isoformat(),
            "total_scanned": 0,
            "total_found": 0,
            "stocks": []
        }


if __name__ == "__main__":
    result = scan_52week_highs()

    print("\n" + "="*60)
    print("📊 스캔 결과")
    print("="*60)
    print(f"거래일: {result.get('trading_date')}")
    print(f"발견된 종목: {result['total_found']}개\n")

    for i, stock in enumerate(result['stocks'][:10], 1):
        print(f"{i}. {stock['name']} ({stock['code']})")
        print(f"   종가: {stock['close']:,.0f}원 | RSI: {stock['rsi']:.1f}")
        print(f"   거래량: {stock['volume']:,}주 ({stock['volume_change_pct']:+.1f}%)")
        print(f"   거래대금: {stock['trading_value']/100000000:.1f}억원\n")

from kis_api import KISApi
import json
from datetime import datetime

# 한투 API 초기화
kis = KISApi()

# 캐시 파일
CACHE_FILE = 'scan_results.json'

def save_cache(data):
    """결과를 캐시에 저장"""
    cache_data = {
        'timestamp': datetime.now().isoformat(),
        'results': data
    }
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache_data, f, ensure_ascii=False, indent=2)

def load_cache():
    """캐시에서 결과 로드"""
    try:
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return None

def update_realtime_prices(results):
    """실시간 가격으로 업데이트"""
    for stock in results:
        try:
            price_data = kis.get_current_price(stock['code'])
            if price_data:
                stock['current_price'] = price_data['current_price']
                stock['change_rate'] = price_data['change_rate']
        except:
            pass
    return results
