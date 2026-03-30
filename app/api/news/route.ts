/**
 * 경제 뉴스 하이브리드 API
 * - 국내 RSS: 한경, 매경, 연합뉴스 (무료, 무제한)
 * - 네이버: SerpAPI naver 엔진
 * - 글로벌: SerpAPI google_news 엔진
 * - 중국: SerpAPI baidu_news 엔진 (한국어 번역)
 * - 시장: SerpAPI google_finance_markets (지수 데이터)
 *
 * SerpAPI 무료 플랜 = 월 100회 → 캐시 30분으로 절약
 */

import { NextResponse } from 'next/server';

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
  translated?: boolean;
}

// ────────────────────────────────────────
// 캐시 설정
// ────────────────────────────────────────
const RSS_CACHE_TTL = 10 * 60 * 1000;   // RSS: 10분
const SERP_CACHE_TTL = 3 * 60 * 60 * 1000;  // SerpAPI: 3시간 (쿼터 절약)

interface Cache<T> { data: T; fetchedAt: number }
let rssCache: Cache<NewsItem[]> | null = null;
let naverCache: Cache<NewsItem[]> | null = null;
let googleCache: Cache<NewsItem[]> | null = null;
let baiduCache: Cache<NewsItem[]> | null = null;
let kcifCache: Cache<NewsItem[]> | null = null;

function isFresh<T>(cache: Cache<T> | null, ttl: number): cache is Cache<T> {
  return cache !== null && Date.now() - cache.fetchedAt < ttl;
}

// ────────────────────────────────────────
// 한국어 번역 (Google Translate 비공식 API)
// ────────────────────────────────────────
async function translateToKo(text: string): Promise<string> {
  if (!text) return '';
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return text;
    const data = await res.json();
    // 응답 형식: [[["번역문","원문",null,null,10]],null,"en"]
    if (Array.isArray(data) && Array.isArray(data[0])) {
      return data[0].map((seg: string[]) => seg[0]).join('');
    }
    return text;
  } catch {
    return text;
  }
}

/** 한국어인지 간단 체크 */
function isKorean(text: string): boolean {
  const koreanChars = text.match(/[\uac00-\ud7af]/g);
  return !!koreanChars && koreanChars.length > text.length * 0.15;
}

/** 필요 시 번역 */
async function translateIfNeeded(items: NewsItem[]): Promise<NewsItem[]> {
  const results: NewsItem[] = [];
  for (const item of items) {
    if (isKorean(item.title)) {
      results.push(item);
    } else {
      const [title, description] = await Promise.all([
        translateToKo(item.title),
        item.description ? translateToKo(item.description) : Promise.resolve(''),
      ]);
      results.push({ ...item, title, description, translated: true });
    }
  }
  return results;
}

// ────────────────────────────────────────
// RSS 피드 (국내 경제 뉴스) — 무료
// ────────────────────────────────────────
const RSS_FEEDS = [
  { url: 'https://www.hankyung.com/feed/stock', source: '한국경제' },
  { url: 'https://www.hankyung.com/feed/economy', source: '한국경제' },
  { url: 'https://www.mk.co.kr/rss/30100041/', source: '매일경제' },
  { url: 'https://www.mk.co.kr/rss/30000001/', source: '매일경제' },
  { url: 'https://www.yna.co.kr/RSS/economy.xml', source: '연합뉴스' },
  { url: 'https://www.korea.kr/rss/policy.xml', source: '정책브리핑' },
  { url: 'https://www.korea.kr/rss/pressrelease.xml', source: '정책브리핑' },
];

function extractTag(xml: string, tag: string): string {
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

async function fetchRssFeed(url: string, source: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'OURTLE/1.0 RSS Reader' },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: NewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const block = match[1];
      const title = stripHtml(extractTag(block, 'title'));
      const link = extractTag(block, 'link').replace(/\s/g, '');
      const pubDate = extractTag(block, 'pubDate');
      const description = stripHtml(extractTag(block, 'description')).slice(0, 200);
      if (title && link) items.push({ title, link, source, pubDate, description });
    }
    return items;
  } catch { return []; }
}

async function fetchRssNews(): Promise<NewsItem[]> {
  if (isFresh(rssCache, RSS_CACHE_TTL)) return rssCache.data;
  const results = await Promise.all(RSS_FEEDS.map((f) => fetchRssFeed(f.url, f.source)));
  const items = dedup(sortByDate(results.flat())).slice(0, 15);
  rssCache = { data: items, fetchedAt: Date.now() };
  return items;
}

// ────────────────────────────────────────
// SerpAPI 헬퍼
// ────────────────────────────────────────
function getSerpKey(): string | undefined {
  return process.env.SERPAPI_KEY;
}

async function serpFetch(params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const apiKey = getSerpKey();
  if (!apiKey) return null;
  const qs = new URLSearchParams({ ...params, api_key: apiKey }).toString();
  try {
    const res = await fetch(`https://serpapi.com/search.json?${qs}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ────────────────────────────────────────
// 네이버 뉴스 (SerpAPI naver 엔진)
// ────────────────────────────────────────
async function fetchNaverNews(): Promise<NewsItem[]> {
  if (isFresh(naverCache, SERP_CACHE_TTL)) return naverCache.data;

  const data = await serpFetch({ engine: 'naver', query: '증시 경제', where: 'news' });
  if (!data) return (naverCache as Cache<NewsItem[]> | null)?.data || [];

  const newsResults = (data.news_results || []) as Array<Record<string, unknown>>;
  const items: NewsItem[] = newsResults.slice(0, 8).map((item) => ({
    title: String(item.title || '').replace(/<[^>]*>/g, ''),
    link: String(item.link || ''),
    source: String(item.source || '네이버'),
    pubDate: String(item.date || ''),
    description: String(item.snippet || '').replace(/<[^>]*>/g, '').slice(0, 200),
  }));

  naverCache = { data: items, fetchedAt: Date.now() };
  return items;
}

// ────────────────────────────────────────
// 구글 뉴스 (SerpAPI google_news 엔진)
// ────────────────────────────────────────
async function fetchGoogleNews(): Promise<NewsItem[]> {
  if (isFresh(googleCache, SERP_CACHE_TTL)) return googleCache.data;

  const data = await serpFetch({ engine: 'google_news', q: 'stock market economy', gl: 'us', hl: 'en' });
  if (!data) return (googleCache as Cache<NewsItem[]> | null)?.data || [];

  const newsResults = (data.news_results || []) as Array<Record<string, unknown>>;
  const items: NewsItem[] = newsResults.slice(0, 8).map((item) => {
    const stories = (item.stories || []) as Array<Record<string, unknown>>;
    const first = stories.length > 0 ? stories[0] : item;
    return {
      title: String(first.title || item.title || ''),
      link: String(first.link || item.link || ''),
      source: String((first.source as Record<string,unknown>)?.name || (item.source as Record<string,unknown>)?.name || 'Google News'),
      pubDate: String(first.date || item.date || ''),
      description: String(first.snippet || item.snippet || '').slice(0, 200),
    };
  });

  // 영어 → 한국어 번역
  const translated = await translateIfNeeded(items);
  googleCache = { data: translated, fetchedAt: Date.now() };
  return translated;
}

// ────────────────────────────────────────
// 바이두 뉴스 (SerpAPI baidu_news 엔진)
// ────────────────────────────────────────
async function fetchBaiduNews(): Promise<NewsItem[]> {
  if (isFresh(baiduCache, SERP_CACHE_TTL)) return baiduCache.data;

  const data = await serpFetch({ engine: 'baidu_news', q: '股市 经济 韩国' });
  if (!data) return (baiduCache as Cache<NewsItem[]> | null)?.data || [];

  const newsResults = (data.organic_results || []) as Array<Record<string, unknown>>;
  const items: NewsItem[] = newsResults.slice(0, 6).map((item) => ({
    title: String(item.title || '').replace(/<[^>]*>/g, ''),
    link: String(item.link || ''),
    source: String(item.source || '바이두'),
    pubDate: String(item.date || ''),
    description: String(item.snippet || '').replace(/<[^>]*>/g, '').slice(0, 200),
  }));

  // 중국어 → 한국어 번역
  const translated = await translateIfNeeded(items);
  baiduCache = { data: translated, fetchedAt: Date.now() };
  return translated;
}

// ────────────────────────────────────────
// KCIF 국제금융센터 보고서 (SerpAPI google 엔진)
// ────────────────────────────────────────
async function fetchKcifReports(): Promise<NewsItem[]> {
  if (isFresh(kcifCache, SERP_CACHE_TTL)) return kcifCache.data;

  const data = await serpFetch({
    engine: 'google',
    q: 'site:kcif.or.kr 보고서',
    gl: 'kr',
    hl: 'ko',
    num: '10',
    tbs: 'qdr:w', // 최근 1주일
  });
  if (!data) return (kcifCache as Cache<NewsItem[]> | null)?.data || [];

  const results = (data.organic_results || []) as Array<Record<string, unknown>>;
  const items: NewsItem[] = results.slice(0, 8).map((item) => ({
    title: String(item.title || ''),
    link: String(item.link || ''),
    source: 'KCIF',
    pubDate: String(item.date || ''),
    description: String(item.snippet || '').slice(0, 200),
  }));

  kcifCache = { data: items, fetchedAt: Date.now() };
  return items;
}

// ────────────────────────────────────────
// 공용 유틸
// ────────────────────────────────────────
function sortByDate(items: NewsItem[]): NewsItem[] {
  return items.sort((a, b) => {
    const dateA = new Date(a.pubDate).getTime() || 0;
    const dateB = new Date(b.pubDate).getTime() || 0;
    return dateB - dateA;
  });
}

/** 제목 정규화 (비교용) */
function normalizeTitle(title: string): string {
  return title
    .replace(/[\s\-–—·|:,."'""''()[\]{}]/g, '')
    .replace(/[^\uac00-\ud7afa-zA-Z0-9]/g, '')
    .toLowerCase()
    .slice(0, 40);
}

/** 유사도 체크 (공통 문자 비율) */
function isSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return a === b;
  // 짧은 쪽 기준 70% 이상 겹치면 유사
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let match = 0;
  for (const char of shorter) {
    if (longer.includes(char)) match++;
  }
  return match / shorter.length > 0.7;
}

function dedup(items: NewsItem[]): NewsItem[] {
  const seen: string[] = [];
  return items.filter((item) => {
    const norm = normalizeTitle(item.title);
    if (!norm) return false;
    // 기존 항목 중 유사한 게 있으면 제거
    for (const existing of seen) {
      if (isSimilar(norm, existing)) return false;
    }
    seen.push(norm);
    return true;
  });
}

// ────────────────────────────────────────
// API 핸들러
// ────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tab = searchParams.get('tab') || 'domestic';

  try {
    switch (tab) {
      case 'naver': {
        const items = await fetchNaverNews();
        return NextResponse.json({ items, tab });
      }
      case 'global': {
        const items = await fetchGoogleNews();
        return NextResponse.json({ items, tab });
      }
      case 'china': {
        const items = await fetchBaiduNews();
        return NextResponse.json({ items, tab });
      }
      case 'kcif': {
        const items = await fetchKcifReports();
        return NextResponse.json({ items, tab });
      }
      case 'korea': {
        const hasSerpKey = !!getSerpKey();
        const [rss, naver, kcif] = await Promise.all([
          fetchRssNews(),
          hasSerpKey ? fetchNaverNews() : Promise.resolve([]),
          hasSerpKey ? fetchKcifReports() : Promise.resolve([]),
        ]);
        const combined = dedup(sortByDate([...rss, ...naver, ...kcif])).slice(0, 20);
        return NextResponse.json({ items: combined, tab: 'korea' });
      }
      case 'worldwide': {
        const hasSerpKey = !!getSerpKey();
        const [google, baidu] = await Promise.all([
          hasSerpKey ? fetchGoogleNews() : Promise.resolve([]),
          hasSerpKey ? fetchBaiduNews() : Promise.resolve([]),
        ]);
        const combined = dedup([...google, ...baidu]).slice(0, 15);
        return NextResponse.json({ items: combined, tab: 'worldwide' });
      }
      case 'all': {
        const hasSerpKey = !!getSerpKey();
        const [rss, naver, google, baidu, kcif] = await Promise.all([
          fetchRssNews(),
          hasSerpKey ? fetchNaverNews() : Promise.resolve([]),
          hasSerpKey ? fetchGoogleNews() : Promise.resolve([]),
          hasSerpKey ? fetchBaiduNews() : Promise.resolve([]),
          hasSerpKey ? fetchKcifReports() : Promise.resolve([]),
        ]);
        const korea = dedup(sortByDate([...rss, ...naver, ...kcif])).slice(0, 20);
        const worldwide = dedup([...google, ...baidu]).slice(0, 15);
        return NextResponse.json({
          korea,
          worldwide,
          hasSerpKey,
          tab: 'all',
        });
      }
      default: {
        // domestic (RSS)
        const items = await fetchRssNews();
        return NextResponse.json({ items, tab: 'domestic' });
      }
    }
  } catch (error) {
    const fallback = rssCache?.data || [];
    return NextResponse.json(
      { error: `뉴스 수집 실패: ${error instanceof Error ? error.message : ''}`, items: fallback },
      { status: fallback.length > 0 ? 200 : 500 }
    );
  }
}
