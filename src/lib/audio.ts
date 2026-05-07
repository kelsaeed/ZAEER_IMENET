'use client';

// Tiny audio engine for game sound effects and background music.
//
// Goals:
//   • Zero hard dependency on any audio file existing — drop missing
//     files in /public/sounds and /public/music silently.
//   • Cheap. Most browsers happily play <1.5s MP3 effects out of an
//     <audio> element with no Web Audio plumbing.
//   • Overlap-friendly: a capture sound in the middle of an already-
//     playing move sound shouldn't cut itself off, so we clone the
//     pre-loaded element on each play.
//
// Settings (sound on/off, music on/off, volumes) live in useSettings
// and are read by the consumer; this module is just a thin "tell me
// to play X" surface and does not gate on settings itself. Keeps the
// module trivially testable and lets the consumer respect the
// settings without having to subscribe here.

const SOUND_FILES: Record<string, string> = {
  select:  '/sounds/select.mp3',
  move:    '/sounds/move.mp3',
  capture: '/sounds/capture.mp3',
  shield:  '/sounds/shield.mp3',
  win:     '/sounds/win.mp3',
  lose:    '/sounds/lose.mp3',
};

const MUSIC_FILE = '/music/bg.mp3';

export type SoundKind = keyof typeof SOUND_FILES;

const cache = new Map<SoundKind, HTMLAudioElement>();

function loadEffect(kind: SoundKind): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  const cached = cache.get(kind);
  if (cached) return cached;
  try {
    const el = new Audio(SOUND_FILES[kind]);
    el.preload = 'auto';
    cache.set(kind, el);
    return el;
  } catch {
    // Old browser / test env — give up silently.
    return null;
  }
}

/** Play a one-shot sound effect at the given volume. Idempotent and
 *  silent on failure (missing file, browser blocked autoplay, etc.).
 *  Each call clones the cached element so overlapping plays don't
 *  truncate the in-flight one. */
export function playEffect(kind: SoundKind, volume = 0.7): void {
  const el = loadEffect(kind);
  if (!el) return;
  try {
    const clone = el.cloneNode(true) as HTMLAudioElement;
    clone.volume = Math.max(0, Math.min(1, volume));
    void clone.play().catch(() => { /* file missing / autoplay blocked */ });
  } catch {
    /* clone or play threw — silent */
  }
}

// ─── Background music ────────────────────────────────────────────────────

let musicEl: HTMLAudioElement | null = null;
let musicVolume = 0.4;

function ensureMusicEl(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (musicEl) return musicEl;
  try {
    musicEl = new Audio(MUSIC_FILE);
    musicEl.loop = true;
    musicEl.preload = 'auto';
    musicEl.volume = musicVolume;
    return musicEl;
  } catch {
    return null;
  }
}

/** Start the loop. Tolerates a missing file — the placeholder readme
 *  in /public/music explains where to drop one. Most browsers refuse
 *  to autoplay audio until the user has interacted with the page; if
 *  the play() promise rejects we keep the element ready so a later
 *  call (after a click/tap) succeeds. */
export function startMusic(): void {
  const el = ensureMusicEl();
  if (!el) return;
  try { void el.play().catch(() => { /* autoplay-blocked or 404 */ }); }
  catch { /* silent */ }
}

export function stopMusic(): void {
  if (!musicEl) return;
  try { musicEl.pause(); musicEl.currentTime = 0; }
  catch { /* silent */ }
}

export function setMusicVolume(v: number): void {
  musicVolume = Math.max(0, Math.min(1, v));
  if (musicEl) musicEl.volume = musicVolume;
}
