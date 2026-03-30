'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
  translated?: boolean;
}

type Tab = 'korea' | 'worldwide';

/** 상대 시간 표시 */
function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const now = Date.now();
  const diff = now - date.getTime();
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(diff / 3600000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

/** 출처 뱃지 색상 */
function sourceBadge(source: string) {
  if (source.includes('한국경제') || source.includes('한경')) return 'bg-blue-50 text-blue-600';
  if (source.includes('매일경제') || source.includes('매경')) return 'bg-purple-50 text-purple-600';
  if (source.includes('연합뉴스')) return 'bg-green-50 text-green-600';
  if (source.includes('네이버') || source.includes('Naver')) return 'bg-emerald-50 text-emerald-600';
  if (source.includes('정책브리핑')) return 'bg-sky-50 text-sky-600';
  if (source.includes('KCIF') || source.includes('국제금융')) return 'bg-indigo-50 text-indigo-600';
  if (source.includes('Google') || source.includes('Reuters') || source.includes('Bloomberg') || source.includes('Yahoo'))
    return 'bg-orange-50 text-orange-600';
  if (source.includes('WSJ') || source.includes('CNBC') || source.includes('CNN'))
    return 'bg-orange-50 text-orange-600';
  if (source.includes('바이두') || source.includes('新') || source.includes('中'))
    return 'bg-red-50 text-red-600';
  return 'bg-gray-50 text-gray-600';
}

/** 확장 가능한 뉴스 카드 */
function NewsCard({ item, index, tab }: { item: NewsItem; index: number; tab: string }) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleClick = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);

    // 이미 로드된 경우
    if (content) return;

    setLoading(true);
    setError(false);

    try {
      const res = await fetch(`/api/news/article?url=${encodeURIComponent(item.link)}`);
      const data = await res.json();
      if (data.content && data.content.length > 0) {
        setContent(data.content);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      key={`${tab}-${item.title}-${index}`}
      className={`group bg-white rounded-2xl border transition-all duration-300 cursor-pointer ${
        expanded
          ? 'border-blue-200 shadow-lg col-span-1 md:col-span-2 lg:col-span-3'
          : 'border-gray-100 hover:shadow-md hover:border-gray-200'
      }`}
      onClick={handleClick}
    >
      <div className="p-5">
        {/* 헤더 */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sourceBadge(item.source)}`}>
            {item.source}
          </span>
          {item.translated && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-yellow-50 text-yellow-600">
              번역
            </span>
          )}
          {item.pubDate && (
            <span className="text-[11px] text-[#86868b]">{timeAgo(item.pubDate)}</span>
          )}
          <div className="flex-1" />
          <span className={`text-[11px] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </div>

        {/* 제목 */}
        <h3 className={`text-[15px] font-semibold text-[#1d1d1f] leading-snug mb-2 transition-colors ${
          expanded ? 'text-blue-600' : 'group-hover:text-blue-600'
        }`}>
          {item.title}
        </h3>

        {/* 요약 (접힌 상태) */}
        {!expanded && item.description && (
          <p className="text-[13px] text-[#86868b] leading-relaxed line-clamp-2">
            {item.description}
          </p>
        )}

        {/* 확장된 본문 */}
        {expanded && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            {loading && (
              <div className="space-y-3 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-full" />
                <div className="h-4 bg-gray-100 rounded w-11/12" />
                <div className="h-4 bg-gray-100 rounded w-10/12" />
                <div className="h-4 bg-gray-100 rounded w-full" />
                <div className="h-4 bg-gray-100 rounded w-9/12" />
              </div>
            )}

            {error && (
              <div className="text-center py-4">
                <p className="text-sm text-[#86868b] mb-2">본문을 가져올 수 없습니다.</p>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm text-blue-500 hover:underline"
                >
                  원문 보기 →
                </a>
              </div>
            )}

            {content && (
              <div className="space-y-4">
                {content.split('\n\n').map((para, i) => (
                  <p key={i} className="text-[14px] text-[#333] leading-relaxed">
                    {para}
                  </p>
                ))}
                <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[12px] text-blue-500 hover:underline"
                  >
                    원문 보기 →
                  </a>
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
                    className="text-[12px] text-[#86868b] hover:text-[#1d1d1f]"
                  >
                    접기
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function NewsSection() {
  const [tab, setTab] = useState<Tab>('korea');
  const [news, setNews] = useState<Record<string, NewsItem[]>>({
    korea: [],
    worldwide: [],
  });
  const [loading, setLoading] = useState(true);
  const [hasSerpKey, setHasSerpKey] = useState(false);
  const isMounted = useRef(true);

  const fetchAllNews = useCallback(async () => {
    try {
      const res = await fetch('/api/news?tab=all');
      if (!res.ok) return;
      const data = await res.json();
      if (isMounted.current) {
        setNews({
          korea: data.korea || [],
          worldwide: data.worldwide || [],
        });
        setHasSerpKey(!!data.hasSerpKey);
      }
    } catch { /* ignore */ }
    finally { if (isMounted.current) setLoading(false); }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchAllNews();
    const interval = setInterval(fetchAllNews, 10 * 60 * 1000);
    return () => { isMounted.current = false; clearInterval(interval); };
  }, [fetchAllNews]);

  const items = news[tab] || [];

  // 로딩 스켈레톤
  if (loading) {
    return (
      <section className="py-12 px-6">
        <div className="max-w-[980px] mx-auto">
          <div className="h-8 w-32 bg-gray-200 rounded mb-6 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse">
                <div className="h-3 w-16 bg-gray-200 rounded mb-3" />
                <div className="h-5 w-full bg-gray-200 rounded mb-2" />
                <div className="h-5 w-3/4 bg-gray-200 rounded mb-4" />
                <div className="h-3 w-full bg-gray-100 rounded mb-1" />
                <div className="h-3 w-2/3 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const totalItems = Object.values(news).flat().length;
  if (totalItems === 0) return null;

  return (
    <section className="py-12 px-6">
      <div className="max-w-[980px] mx-auto">
        {/* 헤더 + 탭 */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#1d1d1f]">경제 뉴스</h2>
            <p className="text-sm text-[#86868b] mt-1">
              {tab === 'korea'
                ? '한경 · 매경 · 연합 · 정책브리핑 · 네이버 · KCIF'
                : 'Google News · 바이두 · 한국어 번역'}
            </p>
          </div>

          <div className="flex gap-1 bg-gray-100 rounded-full p-0.5 self-start sm:self-auto">
            <button
              onClick={() => setTab('korea')}
              className={`px-5 py-1.5 text-[13px] font-medium rounded-full transition-all ${
                tab === 'korea'
                  ? 'bg-white text-[#1d1d1f] shadow-sm'
                  : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              한국
            </button>
            {(hasSerpKey || news.worldwide.length > 0) && (
              <button
                onClick={() => setTab('worldwide')}
                className={`px-5 py-1.5 text-[13px] font-medium rounded-full transition-all ${
                  tab === 'worldwide'
                    ? 'bg-white text-[#1d1d1f] shadow-sm'
                    : 'text-[#86868b] hover:text-[#1d1d1f]'
                }`}
              >
                글로벌
              </button>
            )}
          </div>
        </div>

        {/* 뉴스 카드 그리드 */}
        {items.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item, i) => (
              <NewsCard key={`${tab}-${item.title}-${i}`} item={item} index={i} tab={tab} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-[#86868b]">
            <p className="text-sm">
              {tab === 'worldwide'
                ? 'SerpAPI 키가 설정되지 않았습니다.'
                : '뉴스를 불러올 수 없습니다.'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
