'use client';

interface NavbarProps {
  lastUpdated: Date | null;
  onRefresh: () => void;
}

export default function Navbar({ lastUpdated, onRefresh }: NavbarProps) {
  return (
    <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-xl z-50 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="text-2xl font-semibold tracking-tight">Unimind</div>
        <div className="flex items-center gap-6">
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              {lastUpdated.toLocaleTimeString('ko-KR')} 업데이트
            </span>
          )}
          <button
            onClick={onRefresh}
            className="text-sm text-gray-500 hover:text-black transition-colors"
            title="새로고침"
          >
            ↻ 새로고침
          </button>
          <a href="#" className="text-sm text-gray-600 hover:text-black transition-colors">
            대시보드
          </a>
          <a href="#" className="text-sm text-gray-600 hover:text-black transition-colors">
            분석
          </a>
        </div>
      </div>
    </nav>
  );
}
