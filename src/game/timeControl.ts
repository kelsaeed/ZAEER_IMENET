import type { TimeControl, TimeControlPreset } from './types';

/** Chess-flavoured presets exposed in the lobby + offline modal. The
 *  labels resolve through the locales (`preset.*` keys) so the EN/AR
 *  switch in Settings keeps everything in one language. */
export const PRESETS: TimeControlPreset[] = [
  { id: 'bullet',    labelKey: 'preset.bullet',    matchSeconds:  60, increment: 0  },
  { id: 'blitz',     labelKey: 'preset.blitz',     matchSeconds: 180, increment: 2  },
  { id: 'rapid',     labelKey: 'preset.rapid',     matchSeconds: 600, increment: 0  },
  { id: 'classical', labelKey: 'preset.classical', matchSeconds: 900, increment: 10 },
];

/** Default custom-timer values shown in the modal when the user toggles
 *  the timer on without picking a preset. Picked to feel "rapid-ish" so
 *  the first move-to-flag isn't punishing. */
export const DEFAULT_CUSTOM: { matchSeconds: number; increment: number; perMoveSeconds: number } = {
  matchSeconds: 600, // 10 min
  increment: 0,
  perMoveSeconds: 0,
};

export function presetToTimeControl(p: TimeControlPreset): TimeControl {
  return {
    kind: 'clock',
    matchSeconds: p.matchSeconds,
    increment: p.increment,
    perMoveSeconds: 0,
  };
}

/** Two TimeControls match if they would land players in the SAME ruleset.
 *  Used by Quick Match so a "10+0" search never joins someone's "1+0"
 *  bullet room. Untimed matches against untimed; otherwise every field
 *  must agree. */
export function timeControlsMatch(a: TimeControl, b: TimeControl): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'none') return true;
  // both 'clock'
  return a.matchSeconds === b.matchSeconds
      && a.increment === b.increment
      && a.perMoveSeconds === b.perMoveSeconds;
}

/** Render a compact lobby chip like "10+0" or "10+0 · cap 30s". For
 *  untimed games, callers should fall back to the `timer.untimed` locale
 *  key — this helper assumes the time control is `clock`. */
export function formatClockShort(tc: TimeControl): string {
  if (tc.kind !== 'clock') return '';
  const matchMin = Math.round(tc.matchSeconds / 60);
  const base = `${matchMin}+${tc.increment}`;
  return tc.perMoveSeconds > 0 ? `${base} · ${tc.perMoveSeconds}s/move` : base;
}

/** Format remaining seconds as mm:ss (or m:ss for sub-10-minute clocks).
 *  Negative values clamp to 0:00 for the post-timeout review screen. */
export function formatClockMmSs(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}
