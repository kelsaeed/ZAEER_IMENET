'use client';

// Vibration helper. Uses the standard navigator.vibrate API which is
// supported on Android Chrome / Firefox and silently a no-op on
// desktop and iOS Safari. The consumer is expected to gate on the
// user's haptics-enabled setting; this module only checks platform
// support, not preference.

export type HapticPattern = 'tap' | 'medium' | 'win' | 'lose';

const PATTERNS: Record<HapticPattern, number | number[]> = {
  // Short, gentle confirm — used for piece select and basic moves.
  tap: 12,
  // A bit more weight for a kill / damage event.
  medium: 28,
  // Three escalating pulses for a win — feels celebratory on hardware
  // that supports patterns; degrades to a single buzz on hardware
  // that flattens patterns to a single duration.
  win: [40, 30, 60, 30, 80],
  // Two short thuds for the loss — clearly different shape from win.
  lose: [60, 80, 40],
};

export function vibrate(pattern: HapticPattern): void {
  if (typeof navigator === 'undefined') return;
  if (typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(PATTERNS[pattern]); }
  catch { /* very old browser — silent */ }
}
