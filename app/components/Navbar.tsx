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
    { href: '/', label: '대시보드' },
    { href: '/watchlist', label: 'Dennis' },
  ];

  return (
    <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-xl z-50 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-2xl font-semibold tracking-tight">OURTLE</Link>
          <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
            {navItems.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`text-sm px-4 py-1.5 rounded-full transition-colors ${
                  pathname === href
                    ? 'bg-black text-white'
                    : 'text-gray-600 hover:bg-white'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
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
        </div>
      </div>
    </nav>
  );
}
