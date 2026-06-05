'use client';

// Tiny audio engine for game sound effects and background music.
//
// Two backends, evaluated in this order per sound kind:
//
//   1. MP3 file from /public/sounds (preferred — drop in higher-fi
//      cues whenever you have them). The first time a kind's MP3 fails
//      to play (404, autoplay still blocked, …) we mark it broken and
//      stop trying — every subsequent call goes straight to the synth
//      so we don't fire repeated 404s into the network panel.
//
//   2. Web Audio API synthesis. Generated entirely in code, so the
//      game ships joyful audio out of the box even before anyone
//      sources an SFX pack. Each cue is a short combination of
//      oscillators, envelopes and filters tuned to feel like a
//      board-game sound rather than a synth blip.
//
// Same shape for music: a /public/music/bg.mp3 is preferred, otherwise
// we synthesise a slow ambient pad that breathes via a low-frequency
// oscillator on the master gain.
//
// All web-audio creation is gated behind the first user interaction —
// browsers refuse to start an AudioContext until then.

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
// Per-kind "MP3 unavailable" flag. Once a kind has failed to load /
// play once we route it straight to the synth path.
const mp3Broken = new Set<SoundKind>();
let mp3MusicBroken = false;

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
    return null;
  }
}

/** Play a one-shot sound effect at the given volume. Idempotent and
 *  silent on hard failure. Tries MP3 first, falls back to a Web-Audio
 *  synthesised cue when the file isn't there. */
export function playEffect(kind: SoundKind, volume = 0.7): void {
  if (mp3Broken.has(kind)) {
    synthEffect(kind, volume);
    return;
  }
  const el = loadEffect(kind);
  if (!el) {
    mp3Broken.add(kind);
    synthEffect(kind, volume);
    return;
  }
  try {
    const clone = el.cloneNode(true) as HTMLAudioElement;
    clone.volume = Math.max(0, Math.min(1, volume));
    void clone.play().catch(() => {
      mp3Broken.add(kind);
      synthEffect(kind, volume);
    });
  } catch {
    mp3Broken.add(kind);
    synthEffect(kind, volume);
  }
}

// ─── Web Audio: lazy AudioContext ────────────────────────────────────────

let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (audioCtx) return audioCtx;
  try {
    type AC = typeof AudioContext;
    const Ctor: AC | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AC }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

// ─── Synthesised sound effects ───────────────────────────────────────────
//
// Each cue is a few oscillators + a gain envelope + maybe a filter or
// a noise burst. Frequencies / shapes were picked to feel close to the
// board-game touch they're underscoring (a wooden tap for a move, a
// thump for a capture, a bell for a shield).

function synthEffect(kind: SoundKind, volume: number): void {
  const ctx = getCtx();
  if (!ctx) return;
  const v = Math.max(0, Math.min(1, volume));
  switch (kind) {
    case 'select':  return synthSelect(ctx, v);
    case 'move':    return synthMove(ctx, v);
    case 'capture': return synthCapture(ctx, v);
    case 'shield':  return synthShield(ctx, v);
    case 'win':     return synthWin(ctx, v);
    case 'lose':    return synthLose(ctx, v);
  }
}

/** Quick high blip — the "I heard you" tap when you select a piece. */
function synthSelect(ctx: AudioContext, v: number): void {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(1320, t + 0.06);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.25 * v, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.16);
}

/** Wooden thunk — short low burst with a slight pitch fall. */
function synthMove(ctx: AudioContext, v: number): void {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(280, t);
  osc.frequency.exponentialRampToValueAtTime(160, t + 0.08);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.4 * v, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.15);
}

/** Capture — low thud + bright transient noise click on top.
 *  Two layered sources so the cue reads as percussive impact, not
 *  a clean tone. */
function synthCapture(ctx: AudioContext, v: number): void {
  const t = ctx.currentTime;
  // Low thump.
  const lowOsc = ctx.createOscillator();
  const lowGain = ctx.createGain();
  lowOsc.type = 'sine';
  lowOsc.frequency.setValueAtTime(140, t);
  lowOsc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
  lowGain.gain.setValueAtTime(0, t);
  lowGain.gain.linearRampToValueAtTime(0.55 * v, t + 0.005);
  lowGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  lowOsc.connect(lowGain).connect(ctx.destination);
  lowOsc.start(t);
  lowOsc.stop(t + 0.24);

  // Bright high-pass filtered noise click.
  const noise = createNoiseSource(ctx, 0.08);
  if (noise) {
    const noiseGain = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    noiseGain.gain.setValueAtTime(0.18 * v, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    noise.connect(hp).connect(noiseGain).connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.08);
  }
}

/** Bell-like rising chime — used for shield + paralyse cues. Two
 *  stacked sines a perfect-fifth apart so it rings rather than buzzes. */
function synthShield(ctx: AudioContext, v: number): void {
  const t = ctx.currentTime;
  const make = (freq: number, peak: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak * v, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.62);
  };
  make(880, 0.18);   // A5
  make(1320, 0.13);  // E6, a fifth above
}

/** Triumphant ascending arpeggio for the local viewer's win. */
function synthWin(ctx: AudioContext, v: number): void {
  // C5, E5, G5, C6 — bright major chord in sequence.
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.11;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3 * v, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.46);
  });
}

/** Soft descending phrase — the loss cue for the local viewer. */
function synthLose(ctx: AudioContext, v: number): void {
  // G4, E4, D4, C4 — minor descent.
  const notes = [392.0, 329.63, 293.66, 261.63];
  notes.forEach((freq, i) => {
    const t = ctx.currentTime + i * 0.18;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2 * v, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.52);
  });
}

/** Quick white-noise source (for the noisy "click" layer in capture). */
function createNoiseSource(ctx: AudioContext, durationSec: number): AudioBufferSourceNode | null {
  try {
    const sr = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(durationSec * sr)), sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() - 0.5) * 2;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  } catch {
    return null;
  }
}

// ─── Background music ────────────────────────────────────────────────────

let musicEl: HTMLAudioElement | null = null;
let musicVolume = 0.35;

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

// Synthesised ambient pad — a Cm7 chord (C, Eb, G, Bb) of detuned
// sines through a low-pass, with a slow LFO breathing the master
// gain. Started lazily when MP3 isn't available.
let synthMusic: { master: GainNode; nodes: AudioNode[] } | null = null;

function startSynthMusic(): void {
  if (synthMusic) return;
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    // Fade in over 2 s so toggling music on doesn't feel abrupt.
    master.gain.linearRampToValueAtTime(musicVolume, ctx.currentTime + 2);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
    filter.connect(master);

    // Cm7 chord — minor but warm. Detune cents added per voice for
    // that slight chorus-like richness sines on their own lack.
    const voices: { freq: number; detune: number; gain: number }[] = [
      { freq: 130.81, detune:  0, gain: 0.22 }, // C3
      { freq: 155.56, detune:  4, gain: 0.18 }, // Eb3
      { freq: 196.00, detune: -3, gain: 0.16 }, // G3
      { freq: 233.08, detune:  6, gain: 0.13 }, // Bb3
    ];
    const oscs = voices.map(v => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = v.freq;
      osc.detune.value = v.detune;
      g.gain.value = v.gain;
      osc.connect(g).connect(filter);
      osc.start();
      return osc;
    });

    // Breathing LFO on the master so it ebbs and flows instead of
    // sitting at one volume forever.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(master.gain);
    lfo.start();

    synthMusic = { master, nodes: [...oscs, lfo] };
  } catch {
    synthMusic = null;
  }
}

function stopSynthMusic(): void {
  if (!synthMusic) return;
  const ctx = getCtx();
  try {
    const m = synthMusic;
    if (ctx) {
      m.master.gain.cancelScheduledValues(ctx.currentTime);
      m.master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      // Stop all oscillators after the fade.
      const stopAt = ctx.currentTime + 0.45;
      m.nodes.forEach(n => {
        const o = n as OscillatorNode;
        if (typeof o.stop === 'function') {
          try { o.stop(stopAt); } catch { /* already stopped */ }
        }
      });
    }
  } catch {
    /* ignore */
  }
  synthMusic = null;
}

/** Start the music loop. MP3 is preferred; falls back to the
 *  synthesised pad on 404 / autoplay block. Browsers refuse to start
 *  any audio until the page has had a user gesture; we just retry on
 *  the next call (typically the music toggle in Settings, which is
 *  itself a gesture). */
export function startMusic(): void {
  if (mp3MusicBroken) {
    startSynthMusic();
    return;
  }
  const el = ensureMusicEl();
  if (!el) {
    mp3MusicBroken = true;
    startSynthMusic();
    return;
  }
  try {
    void el.play().catch(() => {
      mp3MusicBroken = true;
      startSynthMusic();
    });
  } catch {
    mp3MusicBroken = true;
    startSynthMusic();
  }
}

export function stopMusic(): void {
  if (musicEl) {
    try { musicEl.pause(); musicEl.currentTime = 0; } catch { /* silent */ }
  }
  stopSynthMusic();
}
