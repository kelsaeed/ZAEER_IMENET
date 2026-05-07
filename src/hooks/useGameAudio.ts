'use client';
import { useEffect, useRef } from 'react';
import type { GameState, Player } from '@/game/types';
import { useSettings } from './useSettings';
import { playEffect, startMusic, stopMusic, type SoundKind } from '@/lib/audio';
import { vibrate, type HapticPattern } from '@/lib/haptics';

/** Maps `state.lastAction.key` into the sound + haptic kind we want to
 *  fire on a turn change. Anything not in the map falls back to plain
 *  "move" (cardinal piece move with no combat). */
const ACTION_TO_FX: Record<string, { sound: SoundKind; haptic: HapticPattern }> = {
  'action.eliminated':              { sound: 'capture', haptic: 'medium' },
  'action.batKillsButterfly':       { sound: 'capture', haptic: 'medium' },
  'action.elephantDamaged':         { sound: 'capture', haptic: 'medium' },
  'action.paralyzedElephantDamaged':{ sound: 'capture', haptic: 'medium' },
  'action.butterflyShields':        { sound: 'shield',  haptic: 'tap'    },
  'action.batParalyzes':            { sound: 'shield',  haptic: 'tap'    },
};

interface Opts {
  /** The current engine state. Tolerates `null` so online callers can
   *  pass through their loading state without an extra guard — the
   *  hook simply no-ops until a real state arrives. */
  state: GameState | null;
  /** The local user's player number — used to pick win vs lose on
   *  game end. Pass `null` for shared screens (pass-and-play, tutorial)
   *  where there is no single "viewer" — we'll just play 'win' for
   *  whoever wins. */
  viewerPlayer: Player | null;
}

/** Hook that listens to engine state diffs and fires a sound + haptic
 *  for each meaningful event:
 *    • piece select         → 'select' + tap
 *    • move (no combat)     → 'move' + tap
 *    • capture / damage     → 'capture' + medium
 *    • shield / paralyze    → 'shield' + tap
 *    • win                  → 'win' + win pattern (for the local viewer)
 *    • lose                 → 'lose' + lose pattern (for the local viewer)
 *
 *  Also drives background music start/stop based on the user's music
 *  preference. The hook reads soundEnabled / musicEnabled / hapticsEnabled
 *  from useSettings so toggling them off in the panel takes effect
 *  immediately. */
export function useGameAudio({ state, viewerPlayer }: Opts) {
  const { soundEnabled, hapticsEnabled, musicEnabled } = useSettings();

  // Per-render trackers. Refs so they don't trigger a re-render when
  // they change — they only exist to compare prev vs current. Initial
  // values are safe defaults that suppress a phantom cue on first mount
  // when state is still null (online loading state).
  const prevTurnRef = useRef<number>(state?.turn ?? -1);
  const prevSelectedRef = useRef<string | null>(state?.selectedPieceId ?? null);
  const prevPhaseRef = useRef<string>(state?.phase ?? 'menu');

  const turn = state?.turn ?? null;
  const selectedPieceId = state?.selectedPieceId ?? null;
  const phase = state?.phase ?? null;
  const winner = state?.winner ?? null;
  const lastActionKey = state?.lastAction?.key ?? null;

  // ── Selection sound ───────────────────────────────────────────────────
  useEffect(() => {
    const cur = selectedPieceId;
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = cur;
    if (!cur) return;
    if (cur === prev) return;
    if (soundEnabled) playEffect('select', 0.55);
    if (hapticsEnabled) vibrate('tap');
  }, [selectedPieceId, soundEnabled, hapticsEnabled]);

  // ── Win / lose ────────────────────────────────────────────────────────
  // Fires once when phase transitions from playing → won. The viewer
  // either wins or loses; the win sound takes priority over whatever
  // capture sound the killing move would have produced (handled below
  // by short-circuiting on phase==='won' in the turn-change effect).
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase ?? prev;
    if (prev === 'won' || phase !== 'won') return;
    const wonByMe = viewerPlayer != null && winner === viewerPlayer;
    if (soundEnabled) playEffect(wonByMe ? 'win' : 'lose', 0.85);
    if (hapticsEnabled) vibrate(wonByMe ? 'win' : 'lose');
  }, [phase, winner, viewerPlayer, soundEnabled, hapticsEnabled]);

  // ── Move / capture / shield ───────────────────────────────────────────
  useEffect(() => {
    if (turn == null) return;
    if (turn === prevTurnRef.current) return;
    prevTurnRef.current = turn;
    // Don't double-fire on the same tick that produced a win sound.
    if (phase === 'won') return;
    const fx = (lastActionKey ? ACTION_TO_FX[lastActionKey] : undefined)
      ?? { sound: 'move' as SoundKind, haptic: 'tap' as HapticPattern };
    if (soundEnabled) playEffect(fx.sound, fx.sound === 'move' ? 0.5 : 0.7);
    if (hapticsEnabled) vibrate(fx.haptic);
  }, [turn, lastActionKey, phase, soundEnabled, hapticsEnabled]);

  // ── Background music loop ─────────────────────────────────────────────
  // Browsers block autoplay until the user has interacted with the page,
  // so the first .play() call may silently fail. The music control in
  // Settings re-runs this effect after a tap, which counts as interaction
  // and unblocks playback. If the file is missing, the play() promise
  // rejects and we stay silent — exactly what we want for the placeholder
  // state until the user drops a track in /public/music/bg.mp3.
  useEffect(() => {
    if (musicEnabled) startMusic();
    else stopMusic();
  }, [musicEnabled]);
}
