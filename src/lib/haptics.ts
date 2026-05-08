'use client';

// Vibration helper. Uses the standard navigator.vibrate API which is
// supported on Android Chrome / Firefox and silently a no-op on
// desktop and iOS Safari. The consumer is expected to gate on the
// user's haptics-enabled setting; this module also gates on whether
// the user has actually interacted with the page yet — modern Chrome
// blocks vibrate() without a prior user gesture and logs a console
// "[Intervention] Blocked call to navigator.vibrate" message every
// time, which spams the dev console during automated / SSR-rehydrate
// passes. The first-interaction listener costs almost nothing and
// removes itself after firing.

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

let userInteracted = false;
if (typeof window !== 'undefined') {
  const onFirstInteraction = () => {
    userInteracted = true;
  };
  // pointerdown covers mouse + touch + pen; keydown covers keyboard
  // play (the tutorial uses some keyboard shortcuts). { once: true }
  // auto-removes the listener after firing.
  window.addEventListener('pointerdown', onFirstInteraction, { once: true, capture: true });
  window.addEventListener('keydown', onFirstInteraction, { once: true, capture: true });
}

export function vibrate(pattern: HapticPattern): void {
  if (typeof navigator === 'undefined') return;
  if (!userInteracted) return;
  if (typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(PATTERNS[pattern]); }
  catch { /* very old browser — silent */ }
}
