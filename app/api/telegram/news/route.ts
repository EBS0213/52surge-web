/**
 * 텔레그램 뉴스 발송 API
 * GET /api/telegram/news — 한국 + 글로벌 뉴스를 텔레그램으로 발송
 *
 * ── 발송 스케줄 (KST 기준) ──
 * 07:00  모닝 브리핑 — 전날 21:00부터 축적된 주요 뉴스 종합
 * 08:00~20:00  매시간 — 새 뉴스만 발송
 * 16:00  장중 이슈 정리 — 시장 오픈(09:00~15:30) 동안의 주요 뉴스
 * 21:00~  발송 종료
 *
 * EC2 cron: 매시간 정각  0 * * * * curl -s http://localhost:3000/api/telegram/news
 */

import { NextResponse } from 'next/server';
import { sendNewsMessage, isNewsConfigured, escapeHtml } from '../../../lib/telegram';

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
  translated?: boolean;
}

// ── 상태 관리 ──
let lastSentHashes: Set<string> = new Set();
let lastSentAt = 0;
// 오버나이트 뉴스 축적 (21:00 ~ 07:00 사이 수집)
let overnightKorea: NewsItem[] = [];
let overnightWorld: NewsItem[] = [];
let overnightHashes: Set<string> = new Set();
// 장중 뉴스 축적 (09:00 ~ 16:00 사이 수집)
let marketKorea: NewsItem[] = [];
let marketWorld: NewsItem[] = [];
let marketHashes: Set<string> = new Set();

/** 현재 KST 시각 */
function getKST(): Date {
  const now = new Date();
  // UTC + 9시간
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst;
}

/** KST 시/분 추출 */
function getKSTHour(): number {
  return getKST().getUTCHours();
}

/** 제목 해시 (정규화) */
function titleHash(title: string): string {
  return title
    .replace(/[\s\-–—·|:,."'""''()[\]{}]/g, '')
    .replace(/[^\uac00-\ud7afa-zA-Z0-9]/g, '')
    .toLowerCase()
    .slice(0, 40);
}

/** KST 타임스탬프 문자열 */
function kstTimeStr(): string {
  const kst = getKST();
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  const min = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${y}.${m}.${d} ${h}:${min}`;
}

// ── 메시지 포맷터 ──

/** 일반 뉴스 포맷 */
function formatRegular(section: string, items: NewsItem[]): string {
  if (items.length === 0) return '';
  const lines: string[] = [];
  lines.push(`<b>📰 ${section}</b>`);
  lines.push(`<i>${kstTimeStr()} 기준</i>`);
  lines.push('');
  for (const item of items) {
    lines.push(`• <a href="${item.link}">${escapeHtml(item.title)}</a>`);
    lines.push(`  <i>${escapeHtml(item.source)}</i>`);
  }
  lines.push('');
  lines.push('— <i>OURTLE 52surge.com</i>');
  return lines.join('\n');
}

/** 07:00 모닝 브리핑 포맷 */
function formatMorningBriefing(korea: NewsItem[], world: NewsItem[]): string {
  const lines: string[] = [];
  lines.push(`<b>☀️ 모닝 브리핑</b>`);
  lines.push(`<i>${kstTimeStr()}</i>`);
  lines.push('');
  lines.push('전일 밤 ~ 금일 아침 주요 뉴스를 정리합니다.');
  lines.push('');

  if (korea.length > 0) {
    lines.push('<b>🇰🇷 한국</b>');
    for (const item of korea.slice(0, 10)) {
      lines.push(`• <a href="${item.link}">${escapeHtml(item.title)}</a>`);
      lines.push(`  <i>${escapeHtml(item.source)}</i>`);
    }
    lines.push('');
  }

  if (world.length > 0) {
    lines.push('<b>🌍 글로벌</b>');
    for (const item of world.slice(0, 10)) {
      lines.push(`• <a href="${item.link}">${escapeHtml(item.title)}</a>`);
      lines.push(`  <i>${escapeHtml(item.source)}</i>`);
    }
    lines.push('');
  }

  if (korea.length === 0 && world.length === 0) {
    lines.push('(새로운 뉴스 없음)');
    lines.push('');
  }

  lines.push('— <i>OURTLE 52surge.com</i>');
  return lines.join('\n');
}

/** 16:00 장중 이슈 정리 포맷 */
function formatMarketSummary(korea: NewsItem[], world: NewsItem[]): string {
  const lines: string[] = [];
  lines.push(`<b>📊 장중 이슈 정리</b>`);
  lines.push(`<i>${kstTimeStr()}</i>`);
  lines.push('');
  lines.push('오늘 주식시장(09:00~15:30) 동안 주요 뉴스입니다.');
  lines.push('');

  if (korea.length > 0) {
    lines.push('<b>🇰🇷 한국</b>');
    for (const item of korea.slice(0, 10)) {
      lines.push(`• <a href="${item.link}">${escapeHtml(item.title)}</a>`);
      lines.push(`  <i>${escapeHtml(item.source)}</i>`);
    }
    lines.push('');
  }

  if (world.length > 0) {
    lines.push('<b>🌍 글로벌</b>');
    for (const item of world.slice(0, 10)) {
      lines.push(`• <a href="${item.link}">${escapeHtml(item.title)}</a>`);
      lines.push(`  <i>${escapeHtml(item.source)}</i>`);
    }
    lines.push('');
  }

  if (korea.length === 0 && world.length === 0) {
    lines.push('(장중 이슈 뉴스 없음)');
    lines.push('');
  }

  lines.push('— <i>OURTLE 52surge.com</i>');
  return lines.join('\n');
}

/** 뉴스 배열에 아이템 축적 (중복 방지) */
function accumulateNews(
  target: NewsItem[],
  hashes: Set<string>,
  items: NewsItem[]
): void {
  for (const item of items) {
    const h = titleHash(item.title);
    if (!hashes.has(h)) {
      hashes.add(h);
      target.push(item);
    }
  }
}

export async function GET() {
  if (!isNewsConfigured()) {
    return NextResponse.json(
      { error: 'Telegram news bot not configured. Set TELEGRAM_NEWS_BOT_TOKEN and TELEGRAM_NEWS_CHAT_ID.' },
      { status: 503 }
    );
  }

  const kstHour = getKSTHour();

  // ── 21:00 ~ 06:59 KST → 발송 종료 (단, 뉴스 축적은 함) ──
  if (kstHour >= 21 || kstHour < 7) {
    // 오버나이트 뉴스 축적
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const res = await fetch(`${baseUrl}/api/news?tab=all`, {
        signal: AbortSignal.timeout(30000),
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        accumulateNews(overnightKorea, overnightHashes, data.korea || []);
        accumulateNews(overnightWorld, overnightHashes, data.worldwide || []);
      }
    } catch { /* 무시 — 축적 실패해도 문제없음 */ }

    return NextResponse.json({
      sent: false,
      reason: `KST ${kstHour}시 — 발송 시간 외 (07:00~21:00). 오버나이트 뉴스 축적 중.`,
      overnight: { korea: overnightKorea.length, world: overnightWorld.length },
    });
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/news?tab=all`, {
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`News API failed: ${res.status}`);
    }

    const data = await res.json();
    const koreaNews: NewsItem[] = data.korea || [];
    const worldNews: NewsItem[] = data.worldwide || [];

    const results: { type: string; ok: boolean; error?: string }[] = [];

    // ── 07:00 모닝 브리핑 ──
    if (kstHour === 7) {
      // 현재 뉴스도 오버나이트에 추가
      accumulateNews(overnightKorea, overnightHashes, koreaNews);
      accumulateNews(overnightWorld, overnightHashes, worldNews);

      const msg = formatMorningBriefing(overnightKorea, overnightWorld);
      const result = await sendNewsMessage(msg);
      results.push({ type: 'morning_briefing', ok: result.ok, error: result.description });

      // 오버나이트 버퍼 초기화
      overnightKorea = [];
      overnightWorld = [];
      overnightHashes = new Set();
      // 장중 뉴스 축적 시작을 위해 초기화
      marketKorea = [];
      marketWorld = [];
      marketHashes = new Set();
      // 발송 해시 갱신
      lastSentHashes = new Set([...koreaNews, ...worldNews].map(i => titleHash(i.title)));
      lastSentAt = Date.now();

      return NextResponse.json({ sent: true, type: 'morning_briefing', results });
    }

    // ── 09:00~16:00 장중 뉴스 축적 ──
    if (kstHour >= 9 && kstHour <= 16) {
      accumulateNews(marketKorea, marketHashes, koreaNews);
      accumulateNews(marketWorld, marketHashes, worldNews);
    }

    // ── 16:00 장중 이슈 정리 ──
    if (kstHour === 16) {
      const msg = formatMarketSummary(marketKorea, marketWorld);
      const result = await sendNewsMessage(msg);
      results.push({ type: 'market_summary', ok: result.ok, error: result.description });

      // 장중 버퍼 초기화
      marketKorea = [];
      marketWorld = [];
      marketHashes = new Set();

      // 일반 발송도 겸하지 않음 — 장중 요약으로 대체
      lastSentHashes = new Set([...koreaNews, ...worldNews].map(i => titleHash(i.title)));
      lastSentAt = Date.now();

      return NextResponse.json({ sent: true, type: 'market_summary', results });
    }

    // ── 08:00~20:00 일반 매시간 발송 ──
    const allItems = [...koreaNews, ...worldNews];
    const currentHashes = new Set(allItems.map(item => titleHash(item.title)));

    const newKorea = koreaNews.filter(item => !lastSentHashes.has(titleHash(item.title)));
    const newWorld = worldNews.filter(item => !lastSentHashes.has(titleHash(item.title)));

    const isFirstRun = lastSentAt === 0;

    if (!isFirstRun && newKorea.length === 0 && newWorld.length === 0) {
      return NextResponse.json({ sent: false, reason: 'No new articles since last send', kstHour });
    }

    const koreaToSend = isFirstRun ? koreaNews.slice(0, 9) : newKorea.slice(0, 9);
    const worldToSend = isFirstRun ? worldNews.slice(0, 9) : newWorld.slice(0, 9);

    if (koreaToSend.length > 0) {
      const msg = formatRegular('한국 경제 뉴스', koreaToSend);
      const result = await sendNewsMessage(msg);
      results.push({ type: 'korea_hourly', ok: result.ok, error: result.description });
    }

    if (koreaToSend.length > 0 && worldToSend.length > 0) {
      await new Promise(r => setTimeout(r, 1000));
    }

    if (worldToSend.length > 0) {
      const msg = formatRegular('글로벌 경제 뉴스', worldToSend);
      const result = await sendNewsMessage(msg);
      results.push({ type: 'world_hourly', ok: result.ok, error: result.description });
    }

    lastSentHashes = currentHashes;
    lastSentAt = Date.now();

    return NextResponse.json({
      sent: results.length > 0,
      type: 'hourly',
      kstHour,
      korea: koreaToSend.length,
      worldwide: worldToSend.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `뉴스 발송 실패: ${error instanceof Error ? error.message : ''}` },
      { status: 500 }
    );
  }
}
