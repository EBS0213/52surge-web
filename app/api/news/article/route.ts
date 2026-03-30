/**
 * 기사 원문 가져오기 API
 * URL을 받아서 본문 텍스트 추출 → 한국어 번역 후 반환
 */

import { NextResponse } from 'next/server';

// 캐시 (1시간)
const articleCache = new Map<string, { content: string; fetchedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000;

/** HTML에서 본문 텍스트 추출 */
function extractArticleText(html: string): string {
  // script, style, nav, header, footer, aside 태그 제거
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // article 또는 main 태그 안의 내용 우선
  const articleMatch = cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  const mainMatch = cleaned.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  const contentMatch = cleaned.match(/<div[^>]*class="[^"]*(?:article|content|body|entry|post|story|text)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  const body = articleMatch?.[1] || mainMatch?.[1] || contentMatch?.[1] || cleaned;

  // p 태그 내용 추출
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pRegex.exec(body)) !== null) {
    const text = match[1]
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();
    if (text.length > 20) {
      paragraphs.push(text);
    }
  }

  // p 태그가 충분하지 않으면 전체 텍스트 추출
  if (paragraphs.length < 3) {
    const allText = body
      .replace(/<[^>]*>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 문장 단위로 분리
    const sentences = allText.split(/(?<=[.!?。])\s+/).filter((s) => s.length > 20);
    return sentences.slice(0, 30).join('\n\n');
  }

  return paragraphs.slice(0, 20).join('\n\n');
}

/** 한국어인지 간단 체크 */
function isKorean(text: string): boolean {
  const koreanChars = text.match(/[\uac00-\ud7af]/g);
  return !!koreanChars && koreanChars.length > text.length * 0.1;
}

/** Google Translate로 한국어 번역 (청크 단위) */
async function translateToKo(text: string): Promise<string> {
  if (!text || isKorean(text)) return text;

  // 긴 텍스트는 단락별로 나눠서 번역
  const paragraphs = text.split('\n\n');
  const translated: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) continue;
    // 한 번에 번역할 수 있는 최대 길이 (약 5000자)
    const chunk = para.slice(0, 5000);
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=${encodeURIComponent(chunk)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        translated.push(para);
        continue;
      }
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
    return NextResponse.json({ content: cached.content, cached: true });
  }

  try {
    // 기사 페이지 가져오기
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
    const rawText = extractArticleText(html);

    if (!rawText || rawText.length < 50) {
      return NextResponse.json({ error: '본문을 추출할 수 없습니다', content: '' }, { status: 200 });
    }

    // 한국어 번역
    const content = await translateToKo(rawText);

    // 캐시 저장
    articleCache.set(articleUrl, { content, fetchedAt: Date.now() });

    // 캐시 크기 제한 (최대 100개)
    if (articleCache.size > 100) {
      const oldestKey = articleCache.keys().next().value;
      if (oldestKey) articleCache.delete(oldestKey);
    }

    return NextResponse.json({ content, cached: false });
  } catch (error) {
    return NextResponse.json(
      { error: `기사 로딩 실패: ${error instanceof Error ? error.message : ''}`, content: '' },
      { status: 500 }
    );
  }
}
