'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavbarProps {
  lastUpdated: Date | null;
  onRefresh: () => void;
}

export default function Navbar({ lastUpdated, onRefresh }: NavbarProps) {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/watchlist', label: 'Dennis' },
  ];

  return (
    <nav className="fixed top-0 w-full bg-[#1d1d1f]/95 backdrop-blur-xl z-50">
      <div className="max-w-[980px] mx-auto px-6 h-11 flex items-center">
        {/* 왼쪽: 로고 + 메뉴 */}
        <Link href="/" className="text-white text-xl font-semibold tracking-tight">
          OURTLE
        </Link>

        <div className="flex items-center gap-7 ml-8">
          {navItems.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`text-xs tracking-wide transition-colors ${
                pathname === href
                  ? 'text-white font-medium'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* 오른쪽: 업데이트 시간 + 새로고침 */}
        <div className="flex items-center gap-4 ml-auto">
          {lastUpdated && (
            <span className="text-[10px] text-[#86868b]">
              {lastUpdated.toLocaleTimeString('ko-KR')}
            </span>
          )}
          <button
            onClick={onRefresh}
            className="text-xs text-[#86868b] hover:text-white transition-colors"
            title="새로고침"
          >
            ↻
          </button>
        </div>
      </div>
    </nav>
  );
}
