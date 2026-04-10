'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Tab = 'login' | 'register';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body =
        tab === 'login'
          ? { email, password }
          : { email, password, name };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '요청 처리에 실패했습니다.');
        return;
      }

      // 성공 → 홈으로 이동
      router.push('/');
      router.refresh();
    } catch {
      setError('서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      {/* 로고 */}
      <div className="mb-10 text-center">
        <Link href="/" className="text-4xl font-black tracking-tight text-black hover:text-gray-700 transition-colors">
          OURTLE
        </Link>
      </div>

      {/* 로그인/회원가입 카드 */}
      <div className="w-full max-w-[400px]">
        {/* 탭 전환 */}
        <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
          <button
            type="button"
            onClick={() => { setTab('login'); setError(''); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === 'login'
                ? 'bg-white text-black shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setError(''); }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === 'register'
                ? 'bg-white text-black shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            회원가입
          </button>
        </div>

        {/* 이메일/비밀번호 폼 */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {tab === 'register' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">이름</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">이메일</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              autoComplete="email"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tab === 'register' ? '6자 이상' : '비밀번호'}
              required
              minLength={tab === 'register' ? 6 : undefined}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black transition-colors"
            />
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? '처리 중...'
              : tab === 'login'
              ? '로그인'
              : '가입하기'}
          </button>
        </form>

        {/* 구분선 */}
        <div className="flex items-center my-6">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="px-4 text-xs text-gray-400">또는</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* 소셜 로그인 */}
        <div className="space-y-3">
          <a
            href="/api/auth/google"
            className="flex items-center w-full px-6 py-3.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" className="flex-shrink-0">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="flex-1 text-center text-sm font-medium text-gray-800">Google로 로그인</span>
          </a>

          <a
            href="/api/auth/kakao"
            className="flex items-center w-full px-6 py-3.5 rounded-lg transition-colors hover:opacity-90"
            style={{ backgroundColor: '#FEE500' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" className="flex-shrink-0">
              <path fill="#191919" d="M12 3C6.48 3 2 6.36 2 10.44c0 2.62 1.75 4.93 4.38 6.24l-1.12 4.12c-.1.36.3.65.62.45l4.8-3.18c.43.04.87.07 1.32.07 5.52 0 10-3.36 10-7.7S17.52 3 12 3z"/>
            </svg>
            <span className="flex-1 text-center text-sm font-medium" style={{ color: '#191919' }}>카카오로 로그인</span>
          </a>
        </div>

      </div>
    </div>
  );
}
