'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6"
      style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #0f0f23 100%)' }}>
      <h1 className="text-2xl font-bold text-white">404 — Page not found</h1>
      <Link
        href="/"
        className="px-4 py-2 rounded-lg font-semibold text-white"
        style={{ background: 'rgba(212,175,55,0.3)', border: '1px solid rgba(212,175,55,0.5)' }}
      >
        Back to Zaeer Imenet
      </Link>
    </div>
  );
}
