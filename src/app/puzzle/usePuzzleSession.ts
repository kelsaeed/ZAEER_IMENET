'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useResponsiveCellSize } from '@/hooks/useResponsiveCellSize';
import { useSettings } from '@/hooks/useSettings';
import { useUser } from '@/hooks/useUser';
import {
  puzzleSnapshotToState,
  type PuzzleMove,
  type PuzzleSnapshot,
} from '@/game/puzzleTypes';
import { simulatePuzzleMove } from '@/game/puzzleValidator';
import { applyMove, applyEndTurn, getValidMoves } from '@/game/logic';
import { chooseAiMove } from '@/game/ai';
import type { GameState, Orientation, Player, Position } from '@/game/types';
import { markNewPuzzleNotificationsRead } from '@/lib/supabase/notifications';
import type { ReplayPly } from '@/components/PuzzleReplayer';

// API shape for a fetched daily puzzle.
export interface TodayPuzzle {
  id: string;
  puzzle_date: string;
  position: PuzzleSnapshot;
  side_to_move: Player;
  difficulty: number;
  theme: string | null;
  title_en: string | null;
  title_ar: string | null;
  flavour_en: string | null;
  flavour_ar: string | null;
}

export type SubmitStatus = 'idle' | 'submitting' | 'wrong' | 'solved';

// Wrong-move detail: when the player submits a wrong attacker move,
// we keep the optimistic state on the board, then run the local hard
// AI to find a defender reply that refutes it (often the move that
// captures the player's lion). The result drives the inline
// Retry / I quit panel.
export interface WrongDetail {
  /** The defender reply we played to show what they would do.
   *  Null means the AI couldn't pick anything (no legal reply, etc.).
   *  In practice the validator guarantees a legal reply exists. */
  defenderReply: PuzzleMove | null;
  /** True iff the defender's reply ends the game with the defender
   *  winning — used to swap the headline copy ("your lion was taken"
   *  vs the softer "their best reply spoils your plan"). */
  lionLost: boolean;
}

/** All of the daily-puzzle session's engine state and move handlers:
 *  selection, the attacker turn flow (including the ant pre-rotate /
 *  move / post-rotate chain), optimistic submission to the server, the
 *  wrong-move refutation, give-up, and retry. Extracted from the page so
 *  the component is pure presentation. Behaviour is identical to the
 *  inline version — same handlers, same order, same effects. */
export function usePuzzleSession(puzzle: TodayPuzzle) {
  const { t } = useSettings();
  const sideToMove = puzzle.side_to_move;

  // Live engine state. savedState is the snapshot before the player's
  // current attacker turn — restored on a wrong submission.
  const [state, setState] = useState<GameState>(() => puzzleSnapshotToState(puzzle.position));
  const [savedState, setSavedState] = useState<GameState>(state);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [validRotations, setValidRotations] = useState<Orientation[]>([]);
  // Tracks the player's in-progress attacker turn so we can compose the
  // PuzzleMove submission at End Turn time. For non-ant pieces the move
  // is submitted immediately and turnActions stays empty. For ants the
  // player can chain pre-rotate / move / post-rotate before pressing
  // End Turn (mirroring the main-game ant flow).
  const [turnActions, setTurnActions] = useState<{
    preRotateTo?: Orientation;
    movedTo?: Position;
    postRotateTo?: Orientation;
  }>({});
  // True once an ant has either moved OR rotated this turn — clicking
  // other cells is locked until End Turn (matches useGame's antLock).
  const [antTurnInProgress, setAntTurnInProgress] = useState(false);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [wrongCount, setWrongCount] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showGiveUpConfirm, setShowGiveUpConfirm] = useState(false);
  const [revealedLine, setRevealedLine] = useState<ReplayPly[] | null>(null);
  // Detail for the wrong-move panel — populated only while status==='wrong'.
  const [wrongDetail, setWrongDetail] = useState<WrongDetail | null>(null);
  const submittingRef = useRef(false);

  /** Reset all per-turn scaffolding. Called whenever the player's turn
   *  ends (cleanly or after a wrong submission revert). */
  const resetTurn = useCallback(() => {
    setSelectedPieceId(null);
    setValidMoves([]);
    setValidRotations([]);
    setTurnActions({});
    setAntTurnInProgress(false);
  }, []);

  // Cell-size sizing to match the main game's responsive math.
  const cellSize = useResponsiveCellSize((vw, vh) => {
    const sideBySide = vw >= 1024;
    const padX = vw < 380 ? 6 : sideBySide ? 12 : 20;
    const sideReserve = sideBySide ? 280 : 0;
    const widthBudget = vw - padX * 2 - sideReserve - (sideBySide ? 12 : 0);
    const maxFromW = Math.floor(widthBudget / 16.6);
    const padY = sideBySide ? 60 : 200;
    const maxFromH = Math.floor((vh - padY) / 16.6);
    const minCell = vw < 360 ? 14 : 16;
    const maxCell = sideBySide ? 64 : 56;
    return Math.max(minCell, Math.min(maxCell, maxFromW, maxFromH));
  }, { initial: 36, layout: false });

  // Make sure /start has been called so started_at reflects open-time.
  useEffect(() => {
    void fetch(`/api/puzzles/${puzzle.id}/start`, { method: 'POST' }).catch(() => {});
  }, [puzzle.id]);

  // Silence the "today's puzzle is up" bell entry once the player is
  // actually on the page. Best-effort; failure is harmless (the row
  // just stays unread until the next visit).
  const { user } = useUser();
  useEffect(() => {
    if (!user) return;
    void markNewPuzzleNotificationsRead(user.id).catch(() => {});
  }, [user]);

  // The visual state we hand to the board — adds selection + valid-move
  // highlights so the existing GameBoard component renders them as it
  // does in the main game.
  const displayState = useMemo<GameState>(() => ({
    ...state,
    selectedPieceId,
    validMoves,
  }), [state, selectedPieceId, validMoves]);

  // Board is locked while submitting, after a wrong move (player must
  // hit Retry/Quit before clicking again), once solved, or once the
  // give-up replay has taken over.
  const locked = status === 'submitting'
    || status === 'wrong'
    || status === 'solved'
    || revealedLine !== null;
  const isPlayerTurn = state.currentPlayer === sideToMove && state.phase === 'playing';

  const submitMove = useCallback(async (move: PuzzleMove, optimisticState: GameState) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setStatus('submitting');
    setFeedback(null);
    try {
      const res = await fetch(`/api/puzzles/${puzzle.id}/move`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ move }),
      });
      if (!res.ok) {
        // Engine drift, expired attempt, etc. Roll the board back.
        setState(savedState);
        resetTurn();
        setStatus('idle');
        const body = await res.json().catch(() => ({}));
        setFeedback(body?.error ?? `Error ${res.status}`);
        return;
      }
      const data = await res.json() as {
        result: 'wrong' | 'continue' | 'solved' | 'already-solved';
        defenderReply?: PuzzleMove | null;
        principalLine?: ReplayPly[];
      };
      if (data.result === 'wrong') {
        // KEEP the optimistic state on the board (the player's wrong
        // attacker move stays applied) and run the local hard AI to
        // pick a defender reply that refutes it. Showing the
        // refutation on the board is the whole point of this branch:
        // the player gets to see WHY their move loses (usually their
        // lion getting taken), instead of a silent revert. Retry / I
        // quit live in the side panel so the player can choose.
        setWrongCount(c => c + 1);
        resetTurn();
        // Quick "showing reply" feedback; replaced once the AI returns.
        setFeedback(t('puzzle.thinkingReply'));
        const defenderSide = (3 - sideToMove) as Player;
        // Yield once so React paints the optimistic state + feedback
        // toast before chooseAiMove blocks for ~1.8s.
        await new Promise(r => setTimeout(r, 0));
        let refuted: GameState = optimisticState;
        let reply: PuzzleMove | null = null;
        try {
          const ai = chooseAiMove(optimisticState, defenderSide, 'lion');
          if (ai) {
            reply = { pieceId: ai.pieceId, target: ai.target, rotateTo: ai.rotateTo };
            refuted = simulatePuzzleMove(optimisticState, reply);
          }
        } catch {
          // AI couldn't find a reply — fall back to just the wrong attacker
          // state without a defender follow-up. The player still sees their
          // own move on the board and the Retry / I quit panel.
        }
        const lionLost = refuted.phase === 'won' && refuted.winner === defenderSide;
        setState(refuted);
        setWrongDetail({ defenderReply: reply, lionLost });
        setFeedback(lionLost ? t('puzzle.wrongLionLost') : t('puzzle.wrongRefuted'));
        setStatus('wrong');
        return;
      }
      if (data.result === 'solved' || data.result === 'already-solved') {
        setStatus('solved');
        setFeedback(t('puzzle.solved'));
        if (Array.isArray(data.principalLine)) setRevealedLine(data.principalLine);
        return;
      }
      // 'continue' — apply the canonical defender reply, then reopen the
      // board for the next attacker move.
      let next = optimisticState;
      if (data.defenderReply) {
        try {
          next = simulatePuzzleMove(optimisticState, data.defenderReply);
        } catch {
          // Should never happen — server-supplied moves are validated by
          // construction. Fail safe by leaving the board where it is.
        }
      }
      setState(next);
      setSavedState(next);
      resetTurn();
      setStatus('idle');
    } finally {
      submittingRef.current = false;
    }
  }, [puzzle.id, savedState, sideToMove, t, resetTurn]);

  const onCellClick = useCallback((row: number, col: number) => {
    if (locked || !isPlayerTurn) return;
    // While an ant turn is in progress, the only legal next actions are
    // Rotate or End Turn (HUD-driven). Cell clicks would otherwise let
    // the player switch pieces or "snap back" mid-turn — useGame
    // explicitly forbids both for ants and we mirror that here.
    if (antTurnInProgress) return;
    // Any new click clears the previous feedback toast so it doesn't
    // hover stale over the board mid-attempt. Wrong-state itself locks
    // the board (handled above via `locked`) and is exited by the
    // Retry / I quit buttons in the side panel, not by a cell click.
    if (feedback) setFeedback(null);

    // Click on a valid target with a piece selected — make the move.
    if (selectedPieceId) {
      const isValid = validMoves.some(m => m.row === row && m.col === col);
      if (isValid) {
        const piece = state.pieces.find(p => p.id === selectedPieceId);
        if (!piece) return;

        // Non-ant: applyMove flips the turn, submit the PuzzleMove
        // immediately. Carry any pre-rotation that was queued (n/a for
        // non-ants but harmless to merge).
        if (piece.type !== 'ant') {
          let optimistic: GameState;
          try {
            optimistic = applyMove(state, selectedPieceId, row, col);
          } catch {
            setFeedback('That move isn’t legal.');
            return;
          }
          const move: PuzzleMove = { pieceId: selectedPieceId, target: { row, col } };
          setSavedState(state);
          setState(optimistic);
          resetTurn();
          void submitMove(move, optimistic);
          return;
        }

        // Ant: applyMove leaves the turn open. Capture the move target
        // and the post-move valid rotations so the player can decide
        // what to rotate to (or just End Turn). We DO NOT submit yet.
        let afterMove: GameState;
        try {
          afterMove = applyMove(state, selectedPieceId, row, col);
        } catch {
          setFeedback('That move isn’t legal.');
          return;
        }
        // First piece-click of the turn → snapshot the pre-turn state.
        if (!antTurnInProgress && Object.keys(turnActions).length === 0) {
          setSavedState(state);
        }
        setState(afterMove);
        setTurnActions(t => ({ ...t, movedTo: { row, col } }));
        setAntTurnInProgress(true);
        setSelectedPieceId(selectedPieceId); // keep ant selected for HUD
        setValidMoves([]); // ant can't move twice
        setValidRotations(afterMove.validRotations ?? []);
        return;
      }
    }

    // Otherwise treat the click as a selection on a piece of the player's side.
    const piece = state.pieces.find(p => p.row === row && p.col === col && p.player === sideToMove);
    if (!piece) {
      setSelectedPieceId(null);
      setValidMoves([]);
      setValidRotations([]);
      return;
    }
    const { moves, validRotations: vr } = getValidMoves(piece, state.pieces);
    setSelectedPieceId(piece.id);
    setValidMoves(moves);
    setValidRotations(piece.type === 'ant' ? vr : []);
  }, [
    locked, isPlayerTurn, antTurnInProgress, selectedPieceId, validMoves,
    state, sideToMove, submitMove, feedback, turnActions, resetTurn,
  ]);

  /** Rotate the selected ant to the given orientation. Mirrors
   *  useGame.rotateAntTo: legal rotations only, recomputes valid moves
   *  from the new orientation when no positional move has happened yet
   *  so the player can rotate-then-move. */
  const onRotateAntTo = useCallback((targetOrientation: Orientation) => {
    if (locked || !isPlayerTurn) return;
    if (!selectedPieceId) return;
    const piece = state.pieces.find(p => p.id === selectedPieceId);
    if (!piece || piece.type !== 'ant') return;
    if (!validRotations.includes(targetOrientation)) return;

    const newPieces = state.pieces.map(p =>
      p.id === selectedPieceId ? { ...p, orientation: targetOrientation } : p,
    );
    const updatedPiece = { ...piece, orientation: targetOrientation };
    const after = getValidMoves(updatedPiece, newPieces);
    const newState: GameState = {
      ...state,
      pieces: newPieces,
      antHasRotated: true,
    };

    // First action of the turn → snapshot pre-turn state. The check
    // matches the one in onCellClick so the snapshot is taken exactly
    // once, regardless of which action came first.
    if (!antTurnInProgress && Object.keys(turnActions).length === 0) {
      setSavedState(state);
    }
    setState(newState);
    setAntTurnInProgress(true);
    // If the ant has already moved this turn, this is a post-rotation;
    // otherwise it's a pre-rotation that may be followed by a move.
    setTurnActions(prev => prev.movedTo
      ? { ...prev, postRotateTo: targetOrientation }
      : { ...prev, preRotateTo: targetOrientation });
    // After a pre-rotation the ant can still move from the new orientation —
    // expose those moves. After a post-rotation moves stay empty (already
    // moved this turn).
    setValidMoves(turnActions.movedTo ? [] : after.moves);
    setValidRotations(after.validRotations);
  }, [locked, isPlayerTurn, selectedPieceId, state, validRotations, antTurnInProgress, turnActions]);

  /** End the player's attacker turn. Composes the PuzzleMove from the
   *  accumulated turnActions, applies applyEndTurn locally, and
   *  submits. Refused if no action was taken (matches useGame). */
  const onEndTurn = useCallback(() => {
    if (locked || !isPlayerTurn) return;
    if (!selectedPieceId) return;
    const piece = state.pieces.find(p => p.id === selectedPieceId);
    if (!piece || piece.type !== 'ant') return;
    if (!turnActions.movedTo && !turnActions.preRotateTo) return;

    let move: PuzzleMove;
    if (turnActions.movedTo) {
      move = {
        pieceId: selectedPieceId,
        target: turnActions.movedTo,
        ...(turnActions.preRotateTo ? { preRotateTo: turnActions.preRotateTo } : {}),
        ...(turnActions.postRotateTo ? { rotateTo: turnActions.postRotateTo } : {}),
      };
    } else {
      // Rotate-only: no positional move, the ant rotated in place. The
      // chosen orientation is the one we last rotated to (preRotateTo
      // in turnActions because the move never happened to flip us into
      // post-mode).
      move = {
        pieceId: selectedPieceId,
        target: { row: piece.row, col: piece.col },
        rotateTo: turnActions.preRotateTo!,
        rotateOnly: true,
      };
    }

    let optimistic: GameState;
    try {
      optimistic = applyEndTurn(state);
    } catch {
      setFeedback('Could not end turn.');
      return;
    }
    setState(optimistic);
    resetTurn();
    void submitMove(move, optimistic);
  }, [locked, isPlayerTurn, selectedPieceId, state, turnActions, submitMove, resetTurn]);

  const onGiveUp = useCallback(async () => {
    setShowGiveUpConfirm(false);
    setStatus('submitting');
    setFeedback(null);
    setWrongDetail(null);
    try {
      const res = await fetch(`/api/puzzles/${puzzle.id}/give-up`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data?.principalLine)) setRevealedLine(data.principalLine);
      else setRevealedLine([]);
    } finally {
      setStatus('idle');
    }
  }, [puzzle.id]);

  // Roll the board back to the position before the player's wrong
  // attacker move. Used by the inline Retry button shown on the
  // wrong-move panel so they can try a different move without
  // navigating away.
  const onRetry = useCallback(() => {
    setState(savedState);
    resetTurn();
    setWrongDetail(null);
    setFeedback(null);
    setStatus('idle');
  }, [savedState, resetTurn]);

  return {
    state, displayState, cellSize, onCellClick,
    revealedLine, feedback, status, wrongCount,
    isPlayerTurn, selectedPieceId, validRotations, turnActions,
    onRotateAntTo, onEndTurn, locked,
    wrongDetail, onRetry,
    showGiveUpConfirm, setShowGiveUpConfirm, onGiveUp,
  };
}
