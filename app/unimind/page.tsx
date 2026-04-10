'use client';

import { useState } from 'react';
import Navbar from '../components/Navbar';

export default function UnimindPage() {
  const [lastUpdated] = useState<Date | null>(null);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar lastUpdated={lastUpdated} onRefresh={() => {}} />

      <main className="pt-20 px-6 pb-16">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Unimind</h1>
          <p className="text-sm text-gray-500 mb-8">
            Unimind 고유의 리서치 · 자동화 · 자산 운용 도구.
          </p>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center">
            <div className="text-5xl mb-4">🧭</div>
            <h2 className="text-lg font-semibold text-gray-700 mb-2">준비 중</h2>
            <p className="text-sm text-gray-500">
              Unimind 페이지는 현재 설계 단계입니다. 곧 공개됩니다.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
