'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 p-6"
      style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #0f0f23 100%)' }}
    >
      <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
      <p className="text-white/70 text-center max-w-md">{error.message}</p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 rounded-lg font-semibold text-white"
        style={{
          background: 'rgba(212,175,55,0.3)',
          border: '1px solid rgba(212,175,55,0.5)',
        }}
      >
        Try again
      </button>
    </div>
  );
}
