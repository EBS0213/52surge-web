"""
52주 신고가 자동 스캔 + 텔레그램 발송
- 장중(09:00~16:00 KST): 10분 간격 스캔 → scan_results.json 저장
- 장마감(16:00 KST): 텔레그램 발송
"""

import schedule
import time
import json
import os
import requests
from datetime import datetime, timezone, timedelta
from scanner import scan_52week_highs

# ================== 설정 ==================
BOT_TOKEN = "8553627102:AAGOSHymQhFKOFd3s3WCpOhXRZzkJA9i6FY"
CHANNEL_ID = "@UlsanWhales"
RESULTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scan_results.json")
KST = timezone(timedelta(hours=9))
# ==========================================


def now_kst():
    """현재 KST 시간 반환"""
    return datetime.now(KST)


def is_market_hours():
    """장중 시간인지 확인 (09:00~16:00 KST)"""
    kst_now = now_kst()
    hour = kst_now.hour
    return 9 <= hour < 16


def save_results(result):
    """스캔 결과를 JSON 파일에 저장 (main.py load_cache 형식에 맞춤)"""
    try:
        cache_data = {
            'timestamp': datetime.now(KST).isoformat(),
            'results': result
        }
        with open(RESULTS_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2, default=str)
        print(f"  💾 결과 저장: {RESULTS_FILE}")
    except Exception as e:
        print(f"  ❌ 결과 저장 실패: {e}")


def send_telegram(message):
    """텔레그램 메시지 발송"""
    try:
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        data = {
            "chat_id": CHANNEL_ID,
            "text": message,
            "parse_mode": "HTML"
        }
        response = requests.post(url, json=data, timeout=10)
        return response.json()
    except Exception as e:
        print(f"텔레그램 발송 오류: {e}")
        return None


def format_telegram_message(result):
    """스캔 결과를 텔레그램 메시지로 포맷"""
    trading_date = result.get('trading_date', 'N/A')
    market_rsi = result.get('market_rsi', {})
    kospi_rsi = market_rsi.get('kospi')
    kosdaq_rsi = market_rsi.get('kosdaq')
    stocks = result.get('stocks', [])

    kospi_text = f"{kospi_rsi:.1f}" if kospi_rsi else "N/A"
    kosdaq_text = f"{kosdaq_rsi:.1f}" if kosdaq_rsi else "N/A"

    if len(stocks) == 0:
        return f"""🌙 <b>[장마감] {trading_date} 52주 신고가</b>

📈 시장 RSI (참고)
- 코스피: {kospi_text}
- 코스닥: {kosdaq_text}

❌ 필터링 조건을 만족하는 종목이 없습니다.

<i>조건: 52주 신고가, 거래량 100만주↑, 거래대금 50억↑, RSI 60↑</i>
<i>대상: 시가총액 상위 1000개 종목</i>
"""

    msg = f"""🌙 <b>[장마감] {trading_date} 52주 신고가 (선별)</b>

📈 시장 RSI (참고)
- 코스피: {kospi_text}
- 코스닥: {kosdaq_text}

✅ <b>선별 종목 ({len(stocks)}개)</b>
<i>52주 신고가, 거래량 100만주↑, 거래대금 50억↑, RSI 60↑</i>
<i>대상: 시가총액 상위 1000개 종목</i>
"""

    for stock in stocks[:15]:  # 최대 15개
        msg += f"""
━━━━━━━━━━━━━━
⭐ <b>{stock['name']}</b> ({stock['code']})
💰 종가: {stock['close']:,.0f}원
🎯 52주고가 갱신!
📊 RSI: {stock['rsi']:.1f}
📈 거래량: {stock['volume']:,}주 ({stock['volume_change_pct']:+.1f}%)
💵 거래대금: {stock['trading_value']/100000000:.1f}억원
"""

    return msg


def market_scan():
    """장중 스캔 (10분 간격) — 파일 저장만, 텔레그램 발송 안 함"""
    if not is_market_hours():
        return

    kst_now = now_kst()
    print(f"\n⏰ [장중 스캔] {kst_now.strftime('%Y-%m-%d %H:%M:%S')} KST")

    try:
        result = scan_52week_highs()
        save_results(result)
        stock_count = len(result.get('stocks', []))
        print(f"  ✅ 스캔 완료 — {stock_count}개 종목 발견")
    except Exception as e:
        print(f"  ❌ 스캔 오류: {e}")
        import traceback
        traceback.print_exc()


def daily_scan_and_notify():
    """장마감 스캔 + 텔레그램 발송 (16:00 KST)"""
    kst_now = now_kst()
    print("\n" + "="*60)
    print(f"[장마감 스캔] {kst_now.strftime('%Y-%m-%d %H:%M:%S')} KST")
    print("="*60)

    try:
        # 스캔 실행
        print("스캔 시작...")
        result = scan_52week_highs()
        save_results(result)

        # 텔레그램 메시지 생성 + 발송
        print("\n텔레그램 메시지 생성 중...")
        message = format_telegram_message(result)

        print("텔레그램 발송 중...")
        response = send_telegram(message)

        if response and response.get('ok'):
            print("✅ 텔레그램 발송 성공!")
            print(f"채널: https://t.me/UlsanWhales")
        else:
            print("❌ 텔레그램 발송 실패")
            print(f"응답: {response}")

        print(f"\n발견된 종목: {result.get('total_found', 0)}개")
        print("="*60)

    except Exception as e:
        print(f"❌ 오류 발생: {e}")
        import traceback
        traceback.print_exc()


def test_run():
    """테스트 실행 (즉시)"""
    print("테스트 모드: 즉시 실행")
    daily_scan_and_notify()


def run_scheduler():
    """스케줄러 실행"""
    # ── EC2는 UTC 기준이므로 KST 시간을 UTC로 변환 ──
    # KST 09:00~15:50 → UTC 00:00~06:50 (10분 간격)
    for hour in range(0, 7):  # UTC 0~6
        for minute in range(0, 60, 10):
            time_str = f"{hour:02d}:{minute:02d}"
            schedule.every().day.at(time_str).do(market_scan)
    # UTC 07:00 = KST 16:00 (마지막 장중 스캔 + 텔레그램)
    schedule.every().day.at("07:00").do(daily_scan_and_notify)

    kst_now = now_kst()
    print("="*60)
    print("🤖 52주 신고가 자동 스캔 봇 시작")
    print("="*60)
    print(f"🕐 현재 시간: {kst_now.strftime('%Y-%m-%d %H:%M:%S')} KST")
    print("📅 장중 스캔: 09:00~16:00 KST, 10분 간격")
    print("📱 텔레그램: 16:00 KST 장마감 시 1회 발송")
    print("📱 발송처: https://t.me/UlsanWhales")
    print("="*60)

    # 다음 실행 시간 표시
    next_run = schedule.next_run()
    if next_run:
        next_kst = next_run.replace(tzinfo=timezone.utc).astimezone(KST)
        print(f"\n⏰ 다음 실행: {next_kst.strftime('%Y-%m-%d %H:%M:%S')} KST")

    print("\n💡 Ctrl+C 로 종료")
    print("="*60 + "\n")

    # 시작 시 장중이면 즉시 1회 스캔
    if is_market_hours():
        print("📌 장중 시간 — 즉시 1회 스캔 실행")
        market_scan()

    # 무한 루프
    while True:
        schedule.run_pending()
        time.sleep(30)  # 30초마다 체크 (10분 간격이므로 충분)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "test":
        # 테스트 모드: python3 auto_scheduler.py test
        test_run()
    else:
        # 정상 모드: python3 auto_scheduler.py
        run_scheduler()
