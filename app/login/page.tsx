'use client';

import Link from 'next/link';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      {/* 로고 */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-black tracking-tight text-black">OURTLE</h1>
        <p className="text-xs text-gray-400 tracking-[0.3em] mt-1.5 uppercase">Turtle Rules Everything Around Me</p>
      </div>

      {/* 로그인 카드 */}
      <div className="w-full max-w-[400px]">
        {/* 소셜 로그인 버튼 */}
        <div className="space-y-3">
          <a
            href="/api/auth/google"
            className="flex items-center w-full px-6 py-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" className="flex-shrink-0">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="flex-1 text-center text-sm font-medium text-gray-800">Google로 로그인</span>
          </a>

          <a
            href="/api/auth/kakao"
            className="flex items-center w-full px-6 py-4 rounded-lg transition-colors hover:opacity-90"
            style={{ backgroundColor: '#FEE500' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" className="flex-shrink-0">
              <path fill="#191919" d="M12 3C6.48 3 2 6.36 2 10.44c0 2.62 1.75 4.93 4.38 6.24l-1.12 4.12c-.1.36.3.65.62.45l4.8-3.18c.43.04.87.07 1.32.07 5.52 0 10-3.36 10-7.7S17.52 3 12 3z"/>
            </svg>
            <span className="flex-1 text-center text-sm font-medium" style={{ color: '#191919' }}>카카오로 로그인</span>
          </a>
        </div>

        {/* 구분선 */}
        <div className="flex items-center my-8">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="px-4 text-xs text-gray-400">또는</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* 안내 */}
        <p className="text-center text-xs text-gray-400 leading-relaxed">
          로그인하면 매매일지(Ledger)를 개인 계정에<br />
          저장하고 관리할 수 있습니다.
        </p>

        {/* 돌아가기 */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-black transition-colors"
          >
            ← 홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
