/**
 * 기사 원문 가져오기 API
 * 1차: newspaper3k (Python) → 정확한 본문 추출
 * 2차: regex 파서 (fallback) → newspaper3k 미설치 시
 * 최종: 한국어 번역
 */

import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);

// 캐시 (1시간)
const articleCache = new Map<string, { content: string; summary: string; keywords: string[]; fetchedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000;

// newspaper3k 사용 가능 여부 (한 번만 체크)
let newspaper3kAvailable: boolean | null = null;

/** newspaper3k Python 스크립트로 기사 추출 */
async function extractWithNewspaper(url: string): Promise<{ text: string; summary: string; keywords: string[] } | null> {
  // 사용 불가 판정 이후 재시도 방지
  if (newspaper3kAvailable === false) return null;

  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'extract_article.py');
    const { stdout } = await execFileAsync('python3', [scriptPath, url], {
      timeout: 15000,
      maxBuffer: 5 * 1024 * 1024, // 5MB
    });

    const data = JSON.parse(stdout);
    if (data.error) {
      // newspaper3k 미설치
      if (data.error.includes('not installed')) {
        newspaper3kAvailable = false;
        return null;
      }
      return null;
    }

    newspaper3kAvailable = true;
    return {
      text: data.text || '',
      summary: data.summary || '',
      keywords: data.keywords || [],
    };
  } catch {
    // python3 없거나 스크립트 실행 실패
    return null;
  }
}

/** HTML에서 본문 텍스트 추출 (fallback) */
function extractArticleText(html: string): string {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const articleMatch = cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  const mainMatch = cleaned.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  const contentMatch = cleaned.match(/<div[^>]*class="[^"]*(?:article|content|body|entry|post|story|text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const body = articleMatch?.[1] || mainMatch?.[1] || contentMatch?.[1] || cleaned;

  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pRegex.exec(body)) !== null) {
    const text = match[1]
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .trim();
    if (text.length > 20) paragraphs.push(text);
  }

  if (paragraphs.length < 3) {
    const allText = body
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const sentences = allText.split(/(?<=[.!?。])\s+/).filter((s) => s.length > 20);
    return sentences.slice(0, 30).join('\n\n');
  }

  return paragraphs.slice(0, 20).join('\n\n');
}

/** 한국어인지 체크 */
function isKorean(text: string): boolean {
  const koreanChars = text.match(/[\uac00-\ud7af]/g);
  return !!koreanChars && koreanChars.length > text.length * 0.1;
}

/** Google Translate로 한국어 번역 */
async function translateToKo(text: string): Promise<string> {
  if (!text || isKorean(text)) return text;

  const paragraphs = text.split('\n\n');
  const translated: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) continue;
    const chunk = para.slice(0, 5000);
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=${encodeURIComponent(chunk)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) { translated.push(para); continue; }
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[0])) {
        translated.push(data[0].map((seg: string[]) => seg[0]).join(''));
      } else {
        translated.push(para);
      }
    } catch {
      translated.push(para);
    }
  }

  return translated.join('\n\n');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const articleUrl = searchParams.get('url');

  if (!articleUrl) {
    return NextResponse.json({ error: 'url 파라미터가 필요합니다' }, { status: 400 });
  }

  // 캐시 확인
  const cached = articleCache.get(articleUrl);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return NextResponse.json({ content: cached.content, summary: cached.summary, keywords: cached.keywords, cached: true });
  }

  try {
    let rawText = '';
    let summary = '';
    let keywords: string[] = [];

    // 1차: newspaper3k 시도
    const np = await extractWithNewspaper(articleUrl);
    if (np && np.text.length > 50) {
      rawText = np.text;
      summary = np.summary;
      keywords = np.keywords;
    }

    // 2차: regex fallback
    if (!rawText || rawText.length < 50) {
      const res = await fetch(articleUrl, {
        signal: AbortSignal.timeout(10000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; OURTLE/1.0; +https://52surge.com)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        },
      });

      if (!res.ok) {
        return NextResponse.json({ error: `기사를 가져올 수 없습니다 (${res.status})` }, { status: 502 });
      }

      const html = await res.text();
      rawText = extractArticleText(html);
    }

    if (!rawText || rawText.length < 50) {
      return NextResponse.json({ error: '본문을 추출할 수 없습니다', content: '' }, { status: 200 });
    }

    // 한국어 번역
    const content = await translateToKo(rawText);
    if (summary) summary = await translateToKo(summary);

    // 캐시 저장
    articleCache.set(articleUrl, { content, summary, keywords, fetchedAt: Date.now() });

    if (articleCache.size > 100) {
      const oldestKey = articleCache.keys().next().value;
      if (oldestKey) articleCache.delete(oldestKey);
    }

    return NextResponse.json({ content, summary, keywords, cached: false });
  } catch (error) {
    return NextResponse.json(
      { error: `기사 로딩 실패: ${error instanceof Error ? error.message : ''}`, content: '' },
      { status: 500 }
    );
  }
}
