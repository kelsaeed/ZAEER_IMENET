'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSettings } from '@/hooks/useSettings';
import { puzzleSnapshotToState, type PuzzleSnapshot, type PuzzleMove } from '@/game/puzzleTypes';
import { simulatePuzzleMove } from '@/game/puzzleValidator';
import type { GameState } from '@/game/types';

// GameBoard is heavy; reuse the existing chunk with the same dynamic
// import the puzzle page uses so it isn't downloaded twice.
const GameBoard = dynamic(() => import('./GameBoard'), { ssr: false });

/** A single ply from the principal_line as the validator emits it. The
 *  shape matches PrincipalPly in puzzleValidator.ts but we accept any
 *  object so a malformed payload from the server doesn't crash the UI. */
export interface ReplayPly {
  side?: 'attacker' | 'defender';
  move?: PuzzleMove;
}

interface Props {
  snapshot: PuzzleSnapshot;
  line: ReplayPly[];
  cellSize: number;
  /** Milliseconds between auto-advance ticks while playing. */
  intervalMs?: number;
  /** Auto-start playing on mount. Defaults true so opening the reveal
   *  feels like a celebration rather than a wall of buttons. */
  autoPlay?: boolean;
}

/** Steppable replay of the principal line. The component pre-computes
 *  every intermediate GameState (snapshot at step 0, snapshot+ply 0
 *  applied at step 1, etc.) so scrubbing is instant — no engine work
 *  on each click. Steps that fail to simulate (malformed server data)
 *  are dropped quietly so a corrupted ply doesn't block the rest of
 *  the replay. */
export default function PuzzleReplayer({
  snapshot, line, cellSize, intervalMs = 900, autoPlay = true,
}: Props) {
  const { theme, t } = useSettings();
  void t; // reserved for localized button labels if we add them

  // Pre-compute every snapshot. Defensive: if a ply doesn't simulate
  // (e.g. server returned garbage), we stop building further states
  // rather than throwing.
  const states = useMemo<GameState[]>(() => {
    const acc: GameState[] = [puzzleSnapshotToState(snapshot)];
    for (const ply of line) {
      if (!ply?.move) break;
      try {
        acc.push(simulatePuzzleMove(acc[acc.length - 1], ply.move));
      } catch {
        break;
      }
    }
    return acc;
  }, [snapshot, line]);

  const lastStep = states.length - 1;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(autoPlay && lastStep > 0);
  const intervalRef = useRef<number | null>(null);

  // Auto-advance loop. Stops at the last step rather than wrapping —
  // the user can press Reset to replay from the start.
  useEffect(() => {
    if (!playing) return;
    if (step >= lastStep) { setPlaying(false); return; }
    const id = window.setInterval(() => {
      setStep(s => {
        if (s >= lastStep) {
          if (intervalRef.current !== null) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, intervalMs);
    intervalRef.current = id;
    return () => {
      window.clearInterval(id);
      intervalRef.current = null;
    };
  }, [playing, step, lastStep, intervalMs]);

  // If the line changes (give-up after solve, etc.), reset the cursor.
  useEffect(() => {
    setStep(0);
    setPlaying(autoPlay && states.length > 1);
  }, [snapshot, line, autoPlay, states.length]);

  const visible = states[Math.min(step, lastStep)];

  return (
    <div className="flex flex-col items-center gap-2">
      <GameBoard state={visible} cellSize={cellSize} onCellClick={() => { /* read-only */ }} />
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-full"
        style={{
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
          color: theme.textPrimary,
          fontSize: 13,
        }}
      >
        <button
          aria-label="Reset"
          onClick={() => { setStep(0); setPlaying(false); }}
          disabled={step === 0 && !playing}
          style={btn(theme)}
        >
          ⏮
        </button>
        <button
          aria-label="Previous"
          onClick={() => { setStep(s => Math.max(0, s - 1)); setPlaying(false); }}
          disabled={step === 0}
          style={btn(theme)}
        >
          ◀
        </button>
        <button
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => {
            if (step >= lastStep) setStep(0);
            setPlaying(p => !p);
          }}
          style={btnAccent(theme)}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          aria-label="Next"
          onClick={() => { setStep(s => Math.min(lastStep, s + 1)); setPlaying(false); }}
          disabled={step >= lastStep}
          style={btn(theme)}
        >
          ▶|
        </button>
        <span style={{ marginInlineStart: 6, color: theme.textMuted, fontVariantNumeric: 'tabular-nums' }}>
          {step}/{lastStep}
        </span>
      </div>
    </div>
  );
}

function btn(theme: ReturnType<typeof useSettings>['theme']): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 999,
    background: 'transparent',
    border: `1px solid ${theme.panelBorder}`,
    color: theme.textPrimary,
    cursor: 'pointer',
    minWidth: 32,
  };
}
function btnAccent(theme: ReturnType<typeof useSettings>['theme']): React.CSSProperties {
  return {
    padding: '4px 12px',
    borderRadius: 999,
    background: theme.p1AccentBg,
    border: `1px solid ${theme.p1AccentBorder}`,
    color: theme.p1Color,
    cursor: 'pointer',
    fontWeight: 700,
    minWidth: 36,
  };
}
