'use client';

export function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6 animate-pulse">
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="h-5 w-24 bg-gray-200 rounded mb-2" />
          <div className="h-3 w-16 bg-gray-100 rounded" />
        </div>
        <div className="h-6 w-14 bg-gray-200 rounded-full" />
      </div>
      <div className="space-y-3">
        <div>
          <div className="h-3 w-10 bg-gray-100 rounded mb-1" />
          <div className="h-8 w-32 bg-gray-200 rounded" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="h-3 w-8 bg-gray-100 rounded mb-1" />
            <div className="h-5 w-12 bg-gray-200 rounded" />
          </div>
          <div>
            <div className="h-3 w-8 bg-gray-100 rounded mb-1" />
            <div className="h-5 w-14 bg-gray-200 rounded" />
          </div>
          <div>
            <div className="h-3 w-8 bg-gray-100 rounded mb-1" />
            <div className="h-5 w-12 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonMarketOverview() {
  return (
    <section className="py-8 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-gray-50 rounded-2xl p-6 animate-pulse">
              <div className="h-3 w-16 bg-gray-200 rounded mb-2" />
              <div className="h-7 w-24 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
