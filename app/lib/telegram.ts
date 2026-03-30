/**
 * Telegram Bot API 유틸리티
 * - 뉴스 발송: UlsanUnivbot → 데일리뉴스 채널
 * - 워치리스트 발송: TradeFiltering_bot → 52Week screener 채널
 */

const NEWS_BOT_TOKEN = process.env.TELEGRAM_NEWS_BOT_TOKEN || '';
const NEWS_CHAT_ID = process.env.TELEGRAM_NEWS_CHAT_ID || '';
const WATCHLIST_BOT_TOKEN = process.env.TELEGRAM_WATCHLIST_BOT_TOKEN || '';
const WATCHLIST_CHAT_ID = process.env.TELEGRAM_WATCHLIST_CHAT_ID || '';

interface TelegramResponse {
  ok: boolean;
  description?: string;
}

/** Telegram sendMessage API 호출 */
async function sendMessage(
  botToken: string,
  chatId: string,
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<TelegramResponse> {
  if (!botToken || !chatId) {
    return { ok: false, description: 'Bot token or chat ID not configured' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();
    return data as TelegramResponse;
  } catch (error) {
    return {
      ok: false,
      description: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/** 뉴스봇으로 메시지 발송 */
export async function sendNewsMessage(text: string): Promise<TelegramResponse> {
  return sendMessage(NEWS_BOT_TOKEN, NEWS_CHAT_ID, text);
}

/** 워치리스트봇으로 메시지 발송 */
export async function sendWatchlistMessage(text: string): Promise<TelegramResponse> {
  return sendMessage(WATCHLIST_BOT_TOKEN, WATCHLIST_CHAT_ID, text);
}

/** HTML 특수문자 이스케이프 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Telegram 설정 확인 */
export function isNewsConfigured(): boolean {
  return !!(NEWS_BOT_TOKEN && NEWS_CHAT_ID);
}

export function isWatchlistConfigured(): boolean {
  return !!(WATCHLIST_BOT_TOKEN && WATCHLIST_CHAT_ID);
}
