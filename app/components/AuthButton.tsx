'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

interface User {
  userId: string;
  name: string;
  email: string;
  picture?: string;
  provider: 'google' | 'kakao';
}

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      setUser(data.user || null);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setShowMenu(false);
    window.location.reload();
  };

  // ── 비로그인: /login 페이지로 이동 ──
  if (!user) {
    return (
      <Link
        href="/login"
        className="text-xs text-[#86868b] hover:text-white transition-colors px-2 py-1 rounded"
      >
        로그인
      </Link>
    );
  }

  // ── 로그인 후: 유저 메뉴 ──
  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
      >
        {user.picture ? (
          <img
            src={user.picture}
            alt=""
            className="w-5 h-5 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-5 h-5 rounded-full bg-[#86868b] flex items-center justify-center text-[9px] text-white font-medium">
            {user.name?.[0] || '?'}
          </div>
        )}
        <span className="text-xs text-white/80 hidden sm:inline">{user.name}</span>
      </button>

      {showMenu && (
        <div className="absolute right-0 top-8 bg-[#2d2d2f] rounded-xl shadow-2xl border border-white/10 p-2 w-44 z-50">
          <div className="px-2 py-1.5 border-b border-white/5 mb-1">
            <p className="text-[11px] text-white font-medium truncate">{user.name}</p>
            <p className="text-[9px] text-[#86868b] truncate">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full text-left px-2 py-1.5 text-xs text-[#86868b] hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            로그아웃
          </button>
        </div>
      )}
    </div>
  );
}
