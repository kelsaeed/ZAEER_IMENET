// Dev-only board render diagnostics, gated behind the existing perf flag
// (localStorage 'zaeer.perf' === '1'). When the flag is off — the default and
// every production session — `PERF_ENABLED` is false and `bumpCellRender` is a
// no-op, so this costs nothing.
//
// Usage: BoardCell calls bumpCellRender() on each render; GameBoard logs the
// per-commit delta so you can SEE how many of the 256 cells actually
// re-rendered for a given interaction (the whole point of this optimization).

let perf = false;
try {
  perf = typeof window !== 'undefined' && window.localStorage.getItem('zaeer.perf') === '1';
} catch {
  perf = false;
}

/** True only when the perf flag was set at page load. Read once; flipping the
 *  flag requires a reload (matching PerfOverlay's behavior). */
export const PERF_ENABLED = perf;

let cellRenders = 0;

/** Increment the global BoardCell render tally (no-op unless the flag is on). */
export function bumpCellRender(): void {
  if (perf) cellRenders++;
}

/** Read the running BoardCell render tally. */
export function readCellRenderCount(): number {
  return cellRenders;
}
