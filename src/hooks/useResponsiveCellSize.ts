'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Shared responsive board sizing.
 *
 * Four pages (home, online match, puzzle, tutorial) each kept their own copy
 * of the same RAF-throttled resize wiring — recompute a cell size on resize /
 * orientationchange, coalesced to one measure per frame, with matching
 * listener cleanup. The only real difference between them was the sizing math
 * and whether the first measure ran before paint. This hook owns the wiring;
 * each caller passes its own pure `compute(vw, vh) => cellSize`.
 *
 * `layout: true` measures in useLayoutEffect so the first value lands before
 * the browser paints (avoids the default-size → real-size CLS jump the game
 * boards care about). The puzzle page historically used a plain effect, so it
 * passes `layout: false` to keep its exact timing.
 *
 * `compute` is read through a ref, so the listeners are still attached exactly
 * once on mount (matching the old `[]`-deps effects) even though callers pass
 * a fresh arrow each render.
 */
export function useResponsiveCellSize(
  compute: (vw: number, vh: number) => number,
  opts: { initial: number; layout?: boolean },
): number {
  const [cellSize, setCellSize] = useState(opts.initial);
  const computeRef = useRef(compute);
  computeRef.current = compute;

  // `opts.layout` is a constant per call site, so this resolves to the same
  // hook on every render — the order stays stable and rules-of-hooks holds.
  const useIsomorphicEffect = opts.layout ? useLayoutEffect : useEffect;
  useIsomorphicEffect(() => {
    function calc() {
      setCellSize(computeRef.current(window.innerWidth, window.innerHeight));
    }
    // RAF-throttle: a drag-resize fires ~60×/s; coalescing to one measure per
    // frame avoids a setState (and 256-cell re-render) on every event.
    let raf = 0;
    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        calc();
      });
    }
    calc();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
    };
  }, []);

  return cellSize;
}
