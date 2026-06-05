'use client';
import { useState, useCallback, useEffect } from 'react';
import { GameState, Orientation, AiLevel, TimeControl } from '@/game/types';
import { createInitialState } from '@/game/initialState';
import { applyMove, applyEndTurn, applyTimeout } from '@/game/logic';
import {
  reduceCellClick,
  reduceRotateAntTo,
  reduceEndTurn,
  reduceSwitchToShieldedPiece,
  reduceSwitchToShieldingButterfly,
} from '@/game/interactions';
import { isAiTurn, aiResultStillApplies } from '@/game/aiTurn';
import { requestAiMove } from '@/lib/ai/aiWorkerClient';

// Bumped to v3 with the history / review feature: GameState now contains a
// history array, viewingHistoryIndex, and winScreenDismissed. Older saved
// games are dropped instead of partially loaded (would crash the review UI).
const STORAGE_KEY = 'zaeer-imenet-state-v3';

function getStoredState(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.phase !== 'playing' && parsed.phase !== 'won') return null;
    if (!Array.isArray(parsed.pieces) || !Number.isFinite(parsed.currentPlayer)) return null;
    if (!parsed.lastAction || typeof parsed.lastAction !== 'object' || typeof (parsed.lastAction as { key?: string }).key !== 'string') return null;
    if (!Array.isArray(parsed.history)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useGame() {
  // Always start with initial state to avoid hydration mismatch
  const [state, setState] = useState<GameState>(() => createInitialState());
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from sessionStorage after mount (client-side only)
  useEffect(() => {
    const stored = getStoredState();
    if (stored) {
      setState(stored);
    }
    setIsHydrated(true);
  }, []);

  // Persist state so the game survives remounts (e.g. React Strict Mode, HMR)
  useEffect(() => {
    if (!isHydrated) return; // Don't persist until after hydration
    if (state.phase !== 'menu') {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [state, isHydrated]);

  // Clear bounce effect after animation completes
  useEffect(() => {
    if (state.bounceEffect) {
      const t = setTimeout(() => {
        setState(prev => ({ ...prev, bounceEffect: undefined }));
      }, 550);
      return () => clearTimeout(t);
    }
  }, [state.bounceEffect?.pieceId, state.turn]);

  const startGame = useCallback((aiLevel: AiLevel | null = null, timeControl: TimeControl = { kind: 'none' }) => {
    setState({
      ...createInitialState({ timeControl }),
      phase: 'playing',
      lastAction: { key: 'action.player1Turn' },
      aiLevel,
    });
  }, []);

  /** Go all the way back to the start screen (with the rules / piece guide). */
  const resetGame = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setState(createInitialState());
  }, []);

  /** Restart the match in place — fresh pieces, no phase change. The player
   *  stays on the board instead of returning to the menu. The current AI
   *  level + time control (if any) are preserved so a player who picked
   *  "vs Hard AI · Blitz 3+2" stays in that mode after a Restart Match. */
  const restartMatch = useCallback(() => {
    setState(prev => ({
      ...createInitialState({ timeControl: prev.timeControl }),
      phase: 'playing',
      lastAction: { key: 'action.player1Turn' },
      aiLevel: prev.aiLevel ?? null,
    }));
  }, []);

  // ── Clock tick (offline) ──────────────────────────────────────────────
  // Drives the visible countdown for the active player. When their clock
  // hits 0 we apply the timeout transition locally — no network involved.
  // The interval is re-armed on every state change but a 1-Hz timer is
  // cheap, and we exit early when the game isn't actively timed.
  useEffect(() => {
    if (!isHydrated) return;
    if (state.phase !== 'playing') return;
    if (!state.clocks || state.timeControl?.kind !== 'clock') return;
    const id = setInterval(() => {
      setState(prev => {
        if (prev.phase !== 'playing' || !prev.clocks || prev.timeControl?.kind !== 'clock') return prev;
        const elapsed = (Date.now() - new Date(prev.clocks.startedAt).getTime()) / 1000;
        const matchKey = prev.currentPlayer === 1 ? 'p1Seconds' : 'p2Seconds';
        const remaining = prev.clocks[matchKey] - elapsed;
        const perMoveExpired = prev.clocks.perMoveSeconds > 0
          && elapsed > prev.clocks.perMoveSeconds;
        if (remaining <= 0 || perMoveExpired) {
          return applyTimeout(prev, prev.currentPlayer);
        }
        return prev;
      });
    }, 250);
    return () => clearInterval(id);
  }, [isHydrated, state.phase, state.timeControl?.kind, state.clocks?.startedAt, state.currentPlayer]);

  // ── AI scheduler ──────────────────────────────────────────────────────────
  // When the local game is in vs-AI mode and it's player 2's turn, queue an
  // AI move on a short delay so the user perceives the bot "thinking" rather
  // than slamming a move down the same frame they finished theirs.
  //
  // The search itself runs on a Web Worker (see aiWorkerClient) so the Hard
  // bot's up-to-1.8s minimax never freezes the UI. Because the result is now
  // asynchronous, we stamp the turn we asked about (`thinkAtTurn`) and apply
  // the move only if the live state is still that same bot turn — guarding
  // against reset / menu / history-review / clock-flag happening mid-think.
  // The effect cleanup cancels the request, terminating any in-flight search.
  useEffect(() => {
    if (!isHydrated) return;
    if (!isAiTurn(state)) return;
    const level = state.aiLevel!;
    const snapshot = state;
    const thinkAtTurn = state.turn;

    let cancelled = false;
    let cancelRequest: (() => void) | null = null;

    const timer = setTimeout(() => {
      if (cancelled) return;
      const handle = requestAiMove(snapshot, 2, level);
      cancelRequest = handle.cancel;
      handle.promise.then(move => {
        if (cancelled || !move) return;
        setState(prev => {
          // Re-validate against the live state: the worker result is stale if
          // the turn advanced or it's no longer the bot's move.
          if (!aiResultStillApplies(prev, thinkAtTurn)) return prev;

          let next = applyMove(prev, move.pieceId, move.target.row, move.target.col);
          // Ant moves don't end the turn on their own — applyMove keeps the
          // ant selected, expecting rotate-then-EndTurn from the human HUD.
          // For the AI, commit the optional rotation and end the turn.
          const moved = next.pieces.find(p => p.id === move.pieceId);
          if (
            moved?.type === 'ant'
            && next.phase === 'playing'
            && next.currentPlayer === 2
          ) {
            if (move.rotateTo && (next.validRotations ?? []).includes(move.rotateTo)) {
              const rotated = next.pieces.map(p =>
                p.id === move.pieceId ? { ...p, orientation: move.rotateTo } : p
              );
              next = { ...next, pieces: rotated, antHasRotated: true };
            }
            next = applyEndTurn(next);
          }
          return next;
        });
      });
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (cancelRequest) cancelRequest();
    };
  }, [
    isHydrated,
    state.aiLevel,
    state.phase,
    state.currentPlayer,
    state.viewingHistoryIndex,
    state.turn,
  ]);

  /** True while the AI is "thinking" — i.e. it's player 2's turn and the
   *  game is in vs-AI mode. Used by the HUD to show a thinking indicator
   *  and by the click handlers to refuse user input on the AI's behalf. */
  const aiThinking = isAiTurn(state);

  // ─── History review ─────────────────────────────────────────────────────
  // While viewingHistoryIndex !== null the board renders a frozen snapshot
  // and clicks are ignored. The "live" state is unaffected; pressing Live
  // returns to interactive play.

  /** Step backward one snapshot. From the live state, jumps to the previous
   *  turn (so you immediately see the change you'd undo). */
  const historyBack = useCallback(() => {
    setState(prev => {
      if (prev.history.length === 0) return prev;
      const cur = prev.viewingHistoryIndex;
      // history[length - 1] equals the live state, so "back from live"
      // jumps to length - 2 — the position one move ago.
      const next = cur === null ? prev.history.length - 2 : cur - 1;
      return { ...prev, viewingHistoryIndex: Math.max(0, next), selectedPieceId: null, validMoves: [] };
    });
  }, []);

  /** Step forward one snapshot. Stepping past the end returns to live mode. */
  const historyForward = useCallback(() => {
    setState(prev => {
      if (prev.viewingHistoryIndex === null) return prev;
      const next = prev.viewingHistoryIndex + 1;
      if (next >= prev.history.length - 1) {
        return { ...prev, viewingHistoryIndex: null };
      }
      return { ...prev, viewingHistoryIndex: next };
    });
  }, []);

  /** Jump straight back to the live state. */
  const historyToLive = useCallback(() => {
    setState(prev => (prev.viewingHistoryIndex === null ? prev : { ...prev, viewingHistoryIndex: null }));
  }, []);

  /** Jump to a specific snapshot index (used by the slider). */
  const historyJumpTo = useCallback((index: number) => {
    setState(prev => {
      if (index < 0 || index >= prev.history.length) return prev;
      // Top of the slider == live.
      if (index === prev.history.length - 1) return { ...prev, viewingHistoryIndex: null };
      return { ...prev, viewingHistoryIndex: index, selectedPieceId: null, validMoves: [] };
    });
  }, []);

  /** Hide the victory modal so the user can browse the board / history. */
  const dismissWinScreen = useCallback(() => {
    setState(prev => ({ ...prev, winScreenDismissed: true }));
  }, []);

  /** Re-open the victory modal from the floating pill. */
  const showWinScreen = useCallback(() => {
    setState(prev => ({ ...prev, winScreenDismissed: false }));
  }, []);

  /** Rotate the currently selected ant to the given orientation. Only valid options are allowed.
   * If ant hasn't moved yet, rotation-only ends the turn automatically (Option 1).
   * If ant has moved, rotation is allowed but turn must be ended manually (Option 2). */
  const rotateAntTo = useCallback((targetOrientation: Orientation) => {
    setState(prev => reduceRotateAntTo(prev, targetOrientation));
  }, []);

  /** End turn (ant: after any action - rotate-only, move-only, or move+rotate; must be ant selected). */
  const endTurn = useCallback(() => {
    setState(reduceEndTurn);
  }, []);

  /** When butterfly is selected and shielding a piece, switch selection to the shielded piece to move both. */
  const switchToShieldedPiece = useCallback(() => {
    setState(reduceSwitchToShieldedPiece);
  }, []);

  /** Inverse: when a shielded piece is selected, switch to its butterfly so the butterfly moves alone. */
  const switchToShieldingButterfly = useCallback(() => {
    setState(reduceSwitchToShieldingButterfly);
  }, []);

  /** Handle a cell click: select piece or execute move. */
  const clickCell = useCallback((row: number, col: number) => {
    setState(prev => reduceCellClick(prev, row, col));
  }, []);

  return {
    state,
    aiThinking,
    startGame,
    resetGame,
    restartMatch,
    rotateAntTo,
    endTurn,
    switchToShieldedPiece,
    switchToShieldingButterfly,
    clickCell,
    // History review
    historyBack,
    historyForward,
    historyToLive,
    historyJumpTo,
    // Win modal
    dismissWinScreen,
    showWinScreen,
  };
}
