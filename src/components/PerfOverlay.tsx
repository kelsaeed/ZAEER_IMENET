'use client';
import { useEffect, useState } from 'react';

// Tiny FPS / frame-time overlay for manually verifying smoothness. It is
// OFF by default and costs nothing unless explicitly enabled — flip it on in
// the browser console with:
//
//   localStorage.setItem('zaeer.perf', '1')   // then reload
//   localStorage.removeItem('zaeer.perf')      // to turn off
//
// When off, the component reads the flag once and returns null without ever
// starting a rAF loop, so it's free in production. It's intentionally a
// measurement aid, not a user-facing feature.

export default function PerfOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [fps, setFps] = useState(0);
  const [worst, setWorst] = useState(0);

  // Read the flag once on mount (client only). If off, we never subscribe to
  // rAF, so there is zero ongoing cost.
  useEffect(() => {
    try {
      setEnabled(typeof window !== 'undefined' && window.localStorage.getItem('zaeer.perf') === '1');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let acc = 0;
    let worstFrame = 0;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      worstFrame = Math.max(worstFrame, dt);
      frames++;
      acc += dt;
      if (acc >= 500) {
        setFps(Math.round((frames * 1000) / acc));
        setWorst(Math.round(worstFrame));
        frames = 0;
        acc = 0;
        worstFrame = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        bottom: 8,
        left: 8,
        zIndex: 9999,
        padding: '4px 8px',
        borderRadius: 6,
        font: '600 12px ui-monospace, SFMono-Regular, Menlo, monospace',
        color: fps >= 55 ? '#86efac' : fps >= 30 ? '#fde68a' : '#fca5a5',
        background: 'rgba(0,0,0,0.7)',
        border: '1px solid rgba(255,255,255,0.15)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {fps} fps · worst {worst}ms
    </div>
  );
}
