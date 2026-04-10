/**
 * 경제 뉴스 API (SerpAPI 제거, 전면 RSS 기반)
 *
 * - 국내 RSS: 한경, 매경, 연합뉴스, 정책브리핑, 연합인포맥스
 * - 네이버 RSS: 네이버 뉴스 경제 섹션
 * - 글로벌 RSS: Reuters, CNBC, Bloomberg (한국어 번역)
 * - 중국 RSS: Xinhua, Caixin (한국어 번역)
 * - KCIF: 국제금융센터 스크래핑
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
const RSS_CACHE_TTL = 10 * 60 * 1000; // 10분

interface Cache<T> { data: T; fetchedAt: number }
let rssCache: Cache<NewsItem[]> | null = null;
let naverCache: Cache<NewsItem[]> | null = null;
let globalCache: Cache<NewsItem[]> | null = null;
let chinaCache: Cache<NewsItem[]> | null = null;
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
    if (Array.isArray(data) && Array.isArray(data[0])) {
      return data[0].map((seg: string[]) => seg[0]).join('');
    }
    return text;
  } catch {
    return text;
  }
}

function isKorean(text: string): boolean {
  const koreanChars = text.match(/[\uac00-\ud7af]/g);
  return !!koreanChars && koreanChars.length > text.length * 0.15;
}

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
// RSS 파서 공통
// ────────────────────────────────────────
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

async function fetchRssFeed(url: string, source: string, maxItems = 5): Promise<NewsItem[]> {
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
    while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
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

// ────────────────────────────────────────
// 국내 RSS 피드
// ────────────────────────────────────────
const DOMESTIC_FEEDS = [
  { url: 'https://www.hankyung.com/feed/finance', source: '한국경제' },
  { url: 'https://www.hankyung.com/feed/economy', source: '한국경제' },
  { url: 'https://www.hankyung.com/feed/all-news', source: '한국경제' },
  { url: 'https://www.mk.co.kr/rss/30100041/', source: '매일경제' },
  { url: 'https://www.mk.co.kr/rss/30000001/', source: '매일경제' },
  { url: 'https://www.yna.co.kr/rss/economy.xml', source: '연합뉴스' },
  { url: 'https://www.yna.co.kr/rss/news.xml', source: '연합뉴스' },
  { url: 'https://www.korea.kr/rss/policy.xml', source: '정책브리핑' },
  { url: 'https://www.korea.kr/rss/pressrelease.xml', source: '정책브리핑' },
  { url: 'https://news.einfomax.co.kr/rss/clickTop.xml', source: '연합인포맥스' },
  { url: 'https://news.einfomax.co.kr/rss/S1N2.xml', source: '연합인포맥스' },
  { url: 'https://news.einfomax.co.kr/rss/S1N7.xml', source: '연합인포맥스' },
  { url: 'https://news.einfomax.co.kr/rss/S1N16.xml', source: '연합인포맥스' },
  { url: 'https://news.einfomax.co.kr/rss/S1N23.xml', source: '연합인포맥스' },
];

async function fetchDomesticNews(): Promise<NewsItem[]> {
  if (isFresh(rssCache, RSS_CACHE_TTL)) return rssCache.data;
  const results = await Promise.all(DOMESTIC_FEEDS.map((f) => fetchRssFeed(f.url, f.source)));
  const all = dedup(sortByDate(results.flat()));

  const bySource = new Map<string, NewsItem[]>();
  for (const item of all) {
    const arr = bySource.get(item.source) || [];
    if (arr.length < 5) arr.push(item);
    bySource.set(item.source, arr);
  }
  const items = sortByDate(Array.from(bySource.values()).flat());
  rssCache = { data: items, fetchedAt: Date.now() };
  return items;
}

// ────────────────────────────────────────
// 네이버 뉴스 RSS (SerpAPI 대체)
// ────────────────────────────────────────
const NAVER_RSS_FEEDS = [
  { url: 'https://news.google.com/rss/search?q=%EC%A6%9D%EC%8B%9C+%EA%B2%BD%EC%A0%9C&hl=ko&gl=KR&ceid=KR:ko', source: '구글뉴스(한국)' },
  { url: 'https://news.google.com/rss/search?q=%EC%BD%94%EC%8A%A4%ED%94%BC+%EC%BD%94%EC%8A%A4%EB%8B%A5&hl=ko&gl=KR&ceid=KR:ko', source: '구글뉴스(한국)' },
  { url: 'https://www.sedaily.com/RSS/Economy', source: '서울경제' },
  { url: 'https://www.sedaily.com/RSS/Stock', source: '서울경제' },
  { url: 'https://rss.donga.com/economy.xml', source: '동아일보' },
];

async function fetchNaverNews(): Promise<NewsItem[]> {
  if (isFresh(naverCache, RSS_CACHE_TTL)) return naverCache.data;
  const results = await Promise.all(NAVER_RSS_FEEDS.map((f) => fetchRssFeed(f.url, f.source, 8)));
  const items = dedup(sortByDate(results.flat())).slice(0, 15);
  naverCache = { data: items, fetchedAt: Date.now() };
  return items;
}

// ────────────────────────────────────────
// 글로벌 뉴스 RSS (SerpAPI 대체)
// ────────────────────────────────────────
const GLOBAL_FEEDS = [
  { url: 'https://news.google.com/rss/search?q=stock+market+economy&hl=en&gl=US&ceid=US:en', source: 'Google News' },
  { url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko', source: 'Google News(비즈니스)' },
  { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', source: 'CNBC' },
  { url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10001147', source: 'CNBC' },
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC Business' },
];

async function fetchGlobalNews(): Promise<NewsItem[]> {
  if (isFresh(globalCache, RSS_CACHE_TTL)) return globalCache.data;
  const results = await Promise.all(GLOBAL_FEEDS.map((f) => fetchRssFeed(f.url, f.source, 6)));
  const all = dedup(sortByDate(results.flat())).slice(0, 15);
  const translated = await translateIfNeeded(all);
  globalCache = { data: translated, fetchedAt: Date.now() };
  return translated;
}

// ────────────────────────────────────────
// 중국 뉴스 RSS (SerpAPI 대체)
// ────────────────────────────────────────
const CHINA_FEEDS = [
  { url: 'https://news.google.com/rss/search?q=%E8%82%A1%E5%B8%82+%E7%BB%8F%E6%B5%8E+%E9%9F%A9%E5%9B%BD&hl=zh-CN&gl=CN&ceid=CN:zh-Hans', source: '구글뉴스(중국)' },
  { url: 'https://news.google.com/rss/search?q=China+economy+stock+market&hl=en&gl=US&ceid=US:en', source: 'Google(China)' },
];

async function fetchChinaNews(): Promise<NewsItem[]> {
  if (isFresh(chinaCache, RSS_CACHE_TTL)) return chinaCache.data;
  const results = await Promise.all(CHINA_FEEDS.map((f) => fetchRssFeed(f.url, f.source, 6)));
  const all = dedup(sortByDate(results.flat())).slice(0, 10);
  const translated = await translateIfNeeded(all);
  chinaCache = { data: translated, fetchedAt: Date.now() };
  return translated;
}

// ────────────────────────────────────────
// KCIF 국제금융센터 스크래핑
// ────────────────────────────────────────
async function fetchKcifReports(): Promise<NewsItem[]> {
  if (isFresh(kcifCache, RSS_CACHE_TTL)) return kcifCache.data;

  const KCIF_URL = 'https://www.kcif.or.kr/annual/newsflashList';
  const currentYear = new Date().getFullYear();

  try {
    const res = await fetch(KCIF_URL, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OURTLE/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return (kcifCache as Cache<NewsItem[]> | null)?.data || [];
    const html = await res.text();

    const text = html.replace(/<[^>]*>/g, '\n').replace(/&nbsp;/g, ' ');
    const items: NewsItem[] = [];

    const lineRegex = /\[(\d{1,2})\.(\d{1,2})\]\s*(.+)/g;
    let match;
    while ((match = lineRegex.exec(text)) !== null && items.length < 15) {
      const month = match[1].padStart(2, '0');
      const day = match[2].padStart(2, '0');
      const title = match[3].trim().replace(/\s+/g, ' ');
      if (!title || title.length < 5) continue;

      const dateStr = `${currentYear}-${month}-${day}T09:00:00+09:00`;
      items.push({
        title: `[${match[1]}.${match[2]}] ${title}`,
        link: KCIF_URL,
        source: 'KCIF',
        pubDate: dateStr,
        description: '국제금융속보',
      });
    }

    kcifCache = { data: items, fetchedAt: Date.now() };
    return items;
  } catch {
    if (kcifCache?.data) return kcifCache.data;
    return [];
  }
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

function normalizeTitle(title: string): string {
  return title
    .replace(/[\s\-–—·|:,."'""''()[\]{}]/g, '')
    .replace(/[^\uac00-\ud7afa-zA-Z0-9]/g, '')
    .toLowerCase()
    .slice(0, 40);
}

function isSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return a === b;
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
        const items = await fetchGlobalNews();
        return NextResponse.json({ items, tab });
      }
      case 'china': {
        const items = await fetchChinaNews();
        return NextResponse.json({ items, tab });
      }
      case 'kcif': {
        const items = await fetchKcifReports();
        return NextResponse.json({ items, tab });
      }
      case 'korea': {
        const [rss, naver, kcif] = await Promise.all([
          fetchDomesticNews(),
          fetchNaverNews(),
          fetchKcifReports(),
        ]);
        const mainNews = dedup(sortByDate([...rss, ...naver])).slice(0, 20);
        const kcifSlot = kcif.slice(0, 5);
        const combined = sortByDate([...mainNews, ...kcifSlot]).slice(0, 30);
        return NextResponse.json({ items: combined, tab: 'korea' });
      }
      case 'worldwide': {
        const [global, china] = await Promise.all([
          fetchGlobalNews(),
          fetchChinaNews(),
        ]);
        const combined = dedup([...global, ...china]).slice(0, 15);
        return NextResponse.json({ items: combined, tab: 'worldwide' });
      }
      case 'all': {
        const [rss, naver, kcif] = await Promise.all([
          fetchDomesticNews(),
          fetchNaverNews(),
          fetchKcifReports(),
        ]);
        const mainNews = dedup(sortByDate([...rss, ...naver])).slice(0, 20);
        const kcifSlot = kcif.slice(0, 5);
        const korea = sortByDate([...mainNews, ...kcifSlot]).slice(0, 30);
        return NextResponse.json({ items: korea, tab: 'all' });
      }
      default: {
        const items = await fetchDomesticNews();
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
