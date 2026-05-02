'use client';

import { useEffect } from 'react';

export default function GlobalError({
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
    <html lang="en">
      <body style={{ margin: 0, background: 'linear-gradient(135deg, #0a0a1a 0%, #0f0f23 100%)' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '1.5rem',
            color: '#fff',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', maxWidth: '28rem' }}>
            {error.message}
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              fontWeight: 600,
              color: '#fff',
              background: 'rgba(212,175,55,0.3)',
              border: '1px solid rgba(212,175,55,0.5)',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
