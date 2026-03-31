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

const ITEMS_PER_PAGE = 9; // 3x3

/** 매체 필터 옵션 */
const SOURCE_FILTERS: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: 'all', label: '전체', match: () => true },
  { key: 'hankyung', label: '한경', match: (s) => s.includes('한국경제') || s.includes('한경') },
  { key: 'maekyung', label: '매경', match: (s) => s.includes('매일경제') || s.includes('매경') },
  { key: 'yonhap', label: '연합', match: (s) => s.includes('연합뉴스') },
  { key: 'policy', label: '정책브리핑', match: (s) => s.includes('정책브리핑') },
  { key: 'naver', label: '네이버', match: (s) => s.includes('네이버') || s.includes('Naver') },
  { key: 'kcif', label: 'KCIF', match: (s) => s.includes('KCIF') || s.includes('국제금융') },
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
function NewsCard({ item, index }: { item: NewsItem; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // KCIF는 개별 기사 링크가 없으므로 새 탭으로 원문 페이지 열기
  const isKcif = item.source === 'KCIF';

  const handleClick = async () => {
    if (isKcif) {
      window.open(item.link, '_blank', 'noopener,noreferrer');
      return;
    }

    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);
    if (content) return;

    setLoading(true);
    setError(false);

    try {
      const res = await fetch(`/api/news/article?url=${encodeURIComponent(item.link)}`);
      const data = await res.json();
      if (data.content && data.content.length > 0) {
        setContent(data.content);
        if (data.summary) setSummary(data.summary);
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
      key={`news-${item.title}-${index}`}
      className={`group bg-white rounded-2xl border transition-all duration-300 cursor-pointer ${
        expanded
          ? 'border-blue-200 shadow-lg col-span-1 md:col-span-2 lg:col-span-3'
          : 'border-gray-100 hover:shadow-md hover:border-gray-200'
      }`}
      onClick={handleClick}
    >
      <div className="p-5">
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
          <span className={`text-[11px] text-[#86868b] transition-transform duration-200 ${!isKcif && expanded ? 'rotate-180' : ''}`}>
            {isKcif ? '↗' : '▼'}
          </span>
        </div>

        <h3 className={`text-[15px] font-semibold text-[#1d1d1f] leading-snug mb-2 transition-colors ${
          expanded ? 'text-blue-600' : 'group-hover:text-blue-600'
        }`}>
          {item.title}
        </h3>

        {!expanded && item.description && (
          <p className="text-[13px] text-[#86868b] leading-relaxed line-clamp-2">
            {item.description}
          </p>
        )}

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
                {summary && (
                  <div className="bg-blue-50 rounded-xl p-4 mb-4">
                    <p className="text-[11px] font-semibold text-blue-600 mb-1">AI 요약</p>
                    <p className="text-[13px] text-[#333] leading-relaxed">{summary}</p>
                  </div>
                )}
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
  const [page, setPage] = useState(1);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [allNews, setAllNews] = useState<NewsItem[]>([]);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);
  const gridRef = useRef<HTMLDivElement>(null);

  const fetchAllNews = useCallback(async () => {
    try {
      const res = await fetch('/api/news?tab=korea');
      if (!res.ok) return;
      const data = await res.json();
      if (isMounted.current) {
        setAllNews(data.items || []);
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

  // 매체 필터 적용
  const filteredNews = sourceFilter === 'all'
    ? allNews
    : allNews.filter((item) => {
        const filter = SOURCE_FILTERS.find((f) => f.key === sourceFilter);
        return filter ? filter.match(item.source) : true;
      });

  // 실제 뉴스가 있는 매체만 필터 목록에 표시
  const availableSources = SOURCE_FILTERS.filter((f) =>
    f.key === 'all' || allNews.some((item) => f.match(item.source))
  );

  const items = filteredNews;
  const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
  const currentItems = items.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // 필터 변경 시 페이지 리셋
  const handleFilterChange = (key: string) => {
    setSourceFilter(key);
    setPage(1);
    setSlideDir(null);
  };

  // 페이지 전환 (슬라이드 애니메이션)
  const goToPage = (newPage: number) => {
    if (newPage === page || newPage < 1 || newPage > totalPages) return;
    setSlideDir(newPage > page ? 'left' : 'right');
    setTimeout(() => {
      setPage(newPage);
      setSlideDir(null);
      // 뉴스 섹션 상단으로 스크롤
      gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 200);
  };

  // 로딩 스켈레톤
  if (loading) {
    return (
      <section className="pt-6 pb-4 px-6">
        <div className="max-w-[980px] mx-auto">
          <div className="h-8 w-32 bg-gray-200 rounded mb-6 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(9)].map((_, i) => (
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

  if (allNews.length === 0) return null;

  return (
    <section className="pt-6 pb-4 px-6">
      <div className="max-w-[980px] mx-auto">
        {/* 헤더 + 매체 필터 */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-[#1d1d1f]">경제 뉴스</h2>
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {availableSources.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleFilterChange(key)}
                className={`px-3 py-1 text-[12px] font-medium rounded-full transition-all ${
                  sourceFilter === key
                    ? 'bg-[#1d1d1f] text-white'
                    : 'bg-gray-100 text-[#86868b] hover:bg-gray-200 hover:text-[#1d1d1f]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 뉴스 카드 그리드 (3x3) */}
        {currentItems.length > 0 ? (
          <div
            ref={gridRef}
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-200 ${
              slideDir === 'left' ? 'opacity-0 translate-x-8' :
              slideDir === 'right' ? 'opacity-0 -translate-x-8' :
              'opacity-100 translate-x-0'
            }`}
          >
            {currentItems.map((item, i) => (
              <NewsCard key={`${sourceFilter}-${page}-${item.title}-${i}`} item={item} index={i} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-[#86868b]">
            <p className="text-sm">
              {sourceFilter !== 'all'
                ? `${SOURCE_FILTERS.find(f => f.key === sourceFilter)?.label || ''} 뉴스가 없습니다.`
                : '뉴스를 불러올 수 없습니다.'}
            </p>
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            {/* 이전 버튼 */}
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] transition-all ${
                page === 1
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-[#86868b] hover:bg-gray-100 hover:text-[#1d1d1f]'
              }`}
            >
              ‹
            </button>

            {/* 페이지 번호 */}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
              <button
                key={num}
                onClick={() => goToPage(num)}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-medium transition-all ${
                  page === num
                    ? 'bg-[#1d1d1f] text-white'
                    : 'text-[#86868b] hover:bg-gray-100 hover:text-[#1d1d1f]'
                }`}
              >
                {num}
              </button>
            ))}

            {/* 다음 버튼 */}
            <button
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages}
              className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] transition-all ${
                page === totalPages
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-[#86868b] hover:bg-gray-100 hover:text-[#1d1d1f]'
              }`}
            >
              ›
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
