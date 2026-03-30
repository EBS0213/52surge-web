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

type Tab = 'domestic' | 'naver' | 'global' | 'china' | 'kcif';

const TAB_CONFIG: { key: Tab; label: string; serpRequired: boolean }[] = [
  { key: 'domestic', label: '국내 RSS', serpRequired: false },
  { key: 'naver', label: '네이버', serpRequired: true },
  { key: 'global', label: '글로벌', serpRequired: true },
  { key: 'china', label: '중국', serpRequired: true },
  { key: 'kcif', label: 'KCIF', serpRequired: true },
];

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
  if (source.includes('Google') || source.includes('Reuters') || source.includes('Bloomberg'))
    return 'bg-orange-50 text-orange-600';
  if (source.includes('바이두') || source.includes('新') || source.includes('中'))
    return 'bg-red-50 text-red-600';
  if (source.includes('KCIF') || source.includes('국제금융'))
    return 'bg-indigo-50 text-indigo-600';
  return 'bg-gray-50 text-gray-600';
}

/** 탭별 부제 */
function tabSubtitle(tab: Tab): string {
  switch (tab) {
    case 'domestic': return '한경 · 매경 · 연합뉴스';
    case 'naver': return '네이버 뉴스 검색';
    case 'global': return 'Google News · 한국어 번역';
    case 'china': return '바이두 뉴스 · 한국어 번역';
    case 'kcif': return '국제금융센터 보고서';
  }
}

export default function NewsSection() {
  const [tab, setTab] = useState<Tab>('domestic');
  const [news, setNews] = useState<Record<string, NewsItem[]>>({
    domestic: [], naver: [], global: [], china: [], kcif: [],
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
          domestic: data.domestic || [],
          naver: data.naver || [],
          global: data.global || [],
          china: data.china || [],
          kcif: data.kcif || [],
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

  // 활성 탭 목록 (SerpAPI 키 없으면 RSS 탭만)
  const visibleTabs = TAB_CONFIG.filter((t) => !t.serpRequired || hasSerpKey);

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

  // 모든 뉴스가 비어있으면 숨김
  const totalItems = Object.values(news).flat().length;
  if (totalItems === 0) return null;

  return (
    <section className="py-12 px-6">
      <div className="max-w-[980px] mx-auto">
        {/* 헤더 + 탭 */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#1d1d1f]">경제 뉴스</h2>
            <p className="text-sm text-[#86868b] mt-1">{tabSubtitle(tab)}</p>
          </div>

          {visibleTabs.length > 1 && (
            <div className="flex gap-1 bg-gray-100 rounded-full p-0.5 self-start sm:self-auto">
              {visibleTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-1.5 text-[13px] font-medium rounded-full transition-all ${
                    tab === t.key
                      ? 'bg-white text-[#1d1d1f] shadow-sm'
                      : 'text-[#86868b] hover:text-[#1d1d1f]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 뉴스 카드 그리드 */}
        {items.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item, i) => (
              <a
                key={`${tab}-${item.title}-${i}`}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group bg-white rounded-2xl p-5 border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all duration-200"
              >
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
                </div>

                <h3 className="text-[15px] font-semibold text-[#1d1d1f] leading-snug mb-2 group-hover:text-blue-600 transition-colors line-clamp-2">
                  {item.title}
                </h3>

                {item.description && (
                  <p className="text-[13px] text-[#86868b] leading-relaxed line-clamp-2">
                    {item.description}
                  </p>
                )}
              </a>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-[#86868b]">
            <p className="text-sm">
              {hasSerpKey
                ? '해당 카테고리에 뉴스가 없습니다.'
                : 'SerpAPI 키를 .env.local에 추가하면 네이버/글로벌/중국 뉴스도 볼 수 있습니다.'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
