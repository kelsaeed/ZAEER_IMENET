'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { saveGameState, GameRow } from '@/lib/supabase/games';
import { createInitialState } from '@/game/initialState';
import { useUser } from '@/hooks/useUser';
import { applyMove, applyEndTurn, getValidMoves } from '@/game/logic';
import type { GameState, Player, Orientation } from '@/game/types';

interface OpponentInfo {
  id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface OnlineGameView {
  /** Loading the initial game record. */
  loading: boolean;
  /** Network/permission errors. */
  error: string | null;
  /** Raw row from Supabase. */
  game: GameRow | null;
  /** Convenient handle on the game state. */
  state: GameState | null;
  /** 1 if I'm player1, 2 if player2, null if I'm a spectator. */
  myPlayerNumber: Player | null;
  /** Opponent profile (null until joined). */
  opponent: OpponentInfo | null;
  /** Both players have joined and the game is active. */
  isPlaying: boolean;
  /** True if the local user can act right now. */
  isMyTurn: boolean;
  /** History review (pure UI). */
  viewingHistoryIndex: number | null;

  // Actions
  clickCell: (row: number, col: number) => void;
  rotateAntTo: (orientation: Orientation) => void;
  endTurn: () => void;
  switchToShieldedPiece: () => void;
  switchToShieldingButterfly: () => void;
  resign: () => void;
  // Rematch in same room
  toggleReady: () => void;
  /** True if I clicked Ready for the next match. */
  iAmReady: boolean;
  /** True if my opponent clicked Ready. */
  opponentReady: boolean;
  // History review
  historyBack: () => void;
  historyForward: () => void;
  historyToLive: () => void;
  historyJumpTo: (index: number) => void;
}

/** Online game state hook.
 *
 * Source of truth = the `games.state` JSON column. Local UI state for the
 * currently-selected piece and valid-move highlights lives client-side and
 * is wiped on every server update so opponent's selections don't leak.
 *
 * Move flow:
 *   1. Player taps a cell.
 *   2. Locally compute the new state (applyMove / getValidMoves).
 *   3. Optimistically render the new state.
 *   4. Persist to DB. Realtime then fans the same state to the opponent.
 *
 * Echo handling: when our own write comes back via Realtime we just adopt
 * the canonical version — usually a no-op visual change. */
export function useOnlineGame(gameId: string | null): OnlineGameView {
  const { user } = useUser();
  const [game, setGame] = useState<GameRow | null>(null);
  const [opponent, setOpponent] = useState<OpponentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Local-only review state (not synced).
  const [viewingHistoryIndex, setViewingHistoryIndex] = useState<number | null>(null);

  // Subscribe to game changes.
  useEffect(() => {
    if (!gameId) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseBrowser();
    let mounted = true;

    supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error || !data) {
          setError(error?.message ?? 'Game not found');
        } else {
          setGame(data as GameRow);
        }
        setLoading(false);
      });

    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        async () => {
          // Re-fetch the row instead of trusting the Realtime payload —
          // some hosts strip the JSON `state` column from the broadcast,
          // which would otherwise leave us with a partial row and trigger
          // the "Game not found" fallback after every move.
          if (!mounted) return;
          const { data } = await supabase
            .from('games')
            .select('*')
            .eq('id', gameId)
            .single();
          if (!mounted || !data) return;
          setGame(data as GameRow);
          setViewingHistoryIndex(null);
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  // Fetch opponent's public profile whenever the game's player ids change.
  useEffect(() => {
    if (!game || !user) return;
    const opponentId =
      game.player1_id === user.id ? game.player2_id :
      game.player2_id === user.id ? game.player1_id :
      null;
    if (!opponentId) {
      setOpponent(null);
      return;
    }
    const supabase = getSupabaseBrowser();
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', opponentId)
      .single()
      .then(({ data }) => {
        if (data) setOpponent(data as OpponentInfo);
      });
  }, [game, user]);

  const myPlayerNumber: Player | null = useMemo(() => {
    if (!user || !game) return null;
    if (game.player1_id === user.id) return 1;
    if (game.player2_id === user.id) return 2;
    return null;
  }, [user, game]);

  const state = game?.state ?? null;
  const isPlaying = game?.status === 'playing';
  const isMyTurn = !!(state && myPlayerNumber !== null && state.currentPlayer === myPlayerNumber && isPlaying && viewingHistoryIndex === null);

  /** Persist a state change. Falls back to optimistic local update if the
   *  network call fails (we'll re-sync from the next Realtime event). */
  const persist = useCallback(async (newState: GameState) => {
    if (!game || !user) return;
    // Optimistic local update.
    setGame(prev => prev ? { ...prev, state: newState, current_turn: newState.turn } : prev);
    try {
      await saveGameState({
        gameId: game.id,
        state: newState,
        player1Id: game.player1_id,
        player2Id: game.player2_id,
      });
    } catch (e) {
      console.error('[online] saveGameState failed', e);
    }
  }, [game, user]);

  // ── Actions ───────────────────────────────────────────────────────────────
  // These mirror the local useGame actions but their results go through the
  // network. Selection / valid-move state is part of GameState so it shows
  // up correctly for the acting player; the opponent sees a no-op until
  // a real move (piece position change) happens on their Realtime feed.

  const clickCell = useCallback((row: number, col: number) => {
    if (!state || !isMyTurn) return;

    // 1. Selected piece + valid move target → execute move.
    if (state.selectedPieceId) {
      const isValid = state.validMoves.some(m => m.row === row && m.col === col);
      if (isValid) {
        persist(applyMove(state, state.selectedPieceId, row, col));
        return;
      }
    }

    // 2. Resolve which of my pieces (if any) is at the clicked cell.
    //    Same precedence as the local hook: prefer the shielded piece, fall
    //    back to a non-overlay piece, then anything.
    const atCell = state.pieces.filter(p =>
      p.row === row && p.col === col && p.player === state.currentPlayer
    );
    const myPiece = atCell.length > 0
      ? (atCell.find(p => p.shieldedBy) ?? atCell.find(p => !p.shielding) ?? atCell[0])
      : null;

    const selectedPiece = state.selectedPieceId
      ? state.pieces.find(p => p.id === state.selectedPieceId)
      : null;

    // 3. Ant turn lock: once the ant moved or rotated, can't switch to a
    //    different piece — only deselect / continue with the ant.
    if (selectedPiece?.type === 'ant' && (state.antMovedThisTurn || state.antHasRotated)) {
      if (myPiece && myPiece.id !== state.selectedPieceId) return;
    }

    // 4. Ant moved + clicked away → snap back to its original square and
    //    fully deselect. The move slot is still considered consumed for
    //    this turn (antMovedThisTurn stays true), so the ant cannot be
    //    moved a second time — only rotated, then End Turn. The block-3
    //    lock above already returns when the click would switch to a
    //    different piece, so the only path that reaches here is "click
    //    on an empty / enemy / non-mine cell".
    if (selectedPiece?.type === 'ant' && state.antMovedThisTurn && !myPiece) {
      const sel = state.pieces.find(p => p.id === state.selectedPieceId);
      const butterfly = sel?.shieldedBy ? state.pieces.find(p => p.id === sel.shieldedBy) : null;
      const reverted = state.pieces.map(p => {
        if (p.id === state.selectedPieceId) {
          const r = { ...p };
          if (state.antOriginalPosition) {
            r.row = state.antOriginalPosition.row;
            r.col = state.antOriginalPosition.col;
          }
          if (state.antOriginalOrientation) r.orientation = state.antOriginalOrientation;
          return r;
        }
        if (butterfly && p.id === butterfly.id && state.antOriginalPosition) {
          return { ...p, row: state.antOriginalPosition.row, col: state.antOriginalPosition.col };
        }
        return p;
      });
      persist({
        ...state,
        pieces: reverted,
        selectedPieceId: null,
        validMoves: [],
        canRotate: false,
        validRotations: [],
        antHasRotated: false,
        // antMovedThisTurn intentionally NOT reset — one move per turn
        // means the slot is gone even after the visual revert.
        antOriginalOrientation: undefined,
        antOriginalPosition: undefined,
      });
      return;
    }

    // 5. Deselecting / switching pieces with a pending rotation → undo it.
    let pieces = state.pieces;
    if (state.selectedPieceId && state.antHasRotated && state.antOriginalOrientation) {
      pieces = state.pieces.map(p =>
        p.id === state.selectedPieceId
          ? { ...p, orientation: state.antOriginalOrientation }
          : p
      );
    }

    if (!myPiece) {
      persist({
        ...state,
        pieces,
        selectedPieceId: null,
        validMoves: [],
        canRotate: false,
        validRotations: [],
        antHasRotated: false,
        antOriginalOrientation: undefined,
        antOriginalPosition: undefined,
      });
      return;
    }

    // 6. Select / re-select the piece at the clicked cell.
    const freshPiece = pieces.find(p => p.id === myPiece.id)!;
    const { moves, canRotate, validRotations } = getValidMoves(freshPiece, pieces);
    const isAnt = freshPiece.type === 'ant';
    const sameSelection = myPiece.id === state.selectedPieceId;
    persist({
      ...state,
      pieces,
      selectedPieceId: myPiece.id,
      // Once this ant has moved this turn, no further moves — only rotation
      // and End Turn remain. Re-selecting the ant must not re-arm its move.
      validMoves: (isAnt && state.antMovedThisTurn) ? [] : moves,
      canRotate,
      validRotations,
      // Preserve the turn-scoped ant flags when re-selecting the same piece;
      // a fresh selection starts the per-turn tracking from the current cell.
      antHasRotated: sameSelection ? state.antHasRotated : false,
      antOriginalOrientation: sameSelection
        ? state.antOriginalOrientation
        : (isAnt ? freshPiece.orientation : undefined),
      antOriginalPosition: sameSelection
        ? state.antOriginalPosition
        : (isAnt ? { row: freshPiece.row, col: freshPiece.col } : undefined),
    });
  }, [state, isMyTurn, persist]);

  const rotateAntTo = useCallback((orientation: Orientation) => {
    if (!state || !isMyTurn || !state.selectedPieceId) return;
    const piece = state.pieces.find(p => p.id === state.selectedPieceId);
    if (!piece || piece.type !== 'ant') return;
    if (!state.validRotations.includes(orientation)) return;

    const newPieces = state.pieces.map(p =>
      p.id === state.selectedPieceId ? { ...p, orientation } : p
    );
    const updatedPiece = { ...piece, orientation };
    const { moves, canRotate, validRotations } = getValidMoves(updatedPiece, newPieces);
    const newState: GameState = {
      ...state,
      pieces: newPieces,
      validMoves: state.antMovedThisTurn ? [] : moves,
      canRotate,
      validRotations,
      antHasRotated: true,
      antOriginalOrientation: state.antOriginalOrientation ?? piece.orientation,
    };
    persist(newState);
  }, [state, isMyTurn, persist]);

  const endTurn = useCallback(() => {
    if (!state || !isMyTurn || !state.selectedPieceId) return;
    const piece = state.pieces.find(p => p.id === state.selectedPieceId);
    if (!piece || piece.type !== 'ant') return;
    if (!state.antMovedThisTurn && !state.antHasRotated) return;
    persist(applyEndTurn(state));
  }, [state, isMyTurn, persist]);

  const switchToShieldedPiece = useCallback(() => {
    if (!state || !isMyTurn || !state.selectedPieceId) return;
    const piece = state.pieces.find(p => p.id === state.selectedPieceId);
    if (!piece || piece.type !== 'butterfly' || !piece.shielding) return;
    const shielded = state.pieces.find(p => p.id === piece.shielding);
    if (!shielded) return;
    const { moves, canRotate, validRotations } = getValidMoves(shielded, state.pieces);
    persist({
      ...state,
      selectedPieceId: shielded.id,
      validMoves: moves,
      canRotate,
      validRotations,
    });
  }, [state, isMyTurn, persist]);

  const switchToShieldingButterfly = useCallback(() => {
    if (!state || !isMyTurn || !state.selectedPieceId) return;
    const shielded = state.pieces.find(p => p.id === state.selectedPieceId);
    if (!shielded || !shielded.shieldedBy) return;
    const butterfly = state.pieces.find(p => p.id === shielded.shieldedBy);
    if (!butterfly) return;
    const { moves, canRotate, validRotations } = getValidMoves(butterfly, state.pieces);
    persist({
      ...state,
      selectedPieceId: butterfly.id,
      validMoves: moves,
      canRotate,
      validRotations,
    });
  }, [state, isMyTurn, persist]);

  const resign = useCallback(async () => {
    if (!game || !user || myPlayerNumber === null || !state) return;
    if (!confirm('Resign this match?')) return;
    const supabase = getSupabaseBrowser();
    const winnerId = myPlayerNumber === 1 ? game.player2_id : game.player1_id;
    const winnerNumber: Player = myPlayerNumber === 1 ? 2 : 1;
    // Update state.phase too so the in-game UI stops accepting clicks
    // and the win screen has a winner to display.
    const finalState: GameState = {
      ...state,
      phase: 'won',
      winner: winnerNumber,
      selectedPieceId: null,
      validMoves: [],
      canRotate: false,
      validRotations: [],
    };
    await supabase
      .from('games')
      .update({
        state: finalState,
        status: 'abandoned',
        winner_id: winnerId,
        finished_at: new Date().toISOString(),
      })
      .eq('id', game.id);
  }, [game, user, myPlayerNumber, state]);

  // ── Rematch in same room ────────────────────────────────────────────────
  // Each player toggles their own ready flag. When both are true, the host
  // (player1 — to avoid double-resets racing) writes the fresh state and
  // increments the series score for whoever just won.
  const iAmReady = !!(game && (
    (myPlayerNumber === 1 && game.p1_ready) ||
    (myPlayerNumber === 2 && game.p2_ready)
  ));
  const opponentReady = !!(game && (
    (myPlayerNumber === 1 && game.p2_ready) ||
    (myPlayerNumber === 2 && game.p1_ready)
  ));

  const toggleReady = useCallback(async () => {
    if (!game || !user || myPlayerNumber === null) return;
    const supabase = getSupabaseBrowser();
    const field = myPlayerNumber === 1 ? 'p1_ready' : 'p2_ready';
    const newReady = !iAmReady;
    const otherReady = myPlayerNumber === 1 ? game.p2_ready : game.p1_ready;

    // Either player triggers the rematch reset once both are ready. The
    // updates are idempotent so a race between both clients just produces
    // two identical writes — the second is a no-op.
    if (newReady && otherReady) {
      const won = game.winner_id;
      const p1Wins = won === game.player1_id ? game.series_p1_wins + 1 : game.series_p1_wins;
      const p2Wins = won === game.player2_id ? game.series_p2_wins + 1 : game.series_p2_wins;
      const fresh = {
        ...createInitialState(),
        phase: 'playing' as const,
        lastAction: { key: 'action.player1Turn' },
      };
      await supabase
        .from('games')
        .update({
          state: fresh,
          status: 'playing',
          winner_id: null,
          finished_at: null,
          current_turn: 0,
          p1_ready: false,
          p2_ready: false,
          series_p1_wins: p1Wins,
          series_p2_wins: p2Wins,
          match_number: game.match_number + 1,
        })
        .eq('id', game.id);
      return;
    }

    // Otherwise: just flip my own ready flag and wait for the opponent.
    await supabase.from('games').update({ [field]: newReady }).eq('id', game.id);
  }, [game, user, myPlayerNumber, iAmReady]);

  // ── History review (local only) ─────────────────────────────────────────
  const historyBack = useCallback(() => {
    if (!state) return;
    const cur = viewingHistoryIndex;
    const next = cur === null ? state.history.length - 2 : cur - 1;
    setViewingHistoryIndex(Math.max(0, next));
  }, [state, viewingHistoryIndex]);

  const historyForward = useCallback(() => {
    if (!state || viewingHistoryIndex === null) return;
    const next = viewingHistoryIndex + 1;
    setViewingHistoryIndex(next >= state.history.length - 1 ? null : next);
  }, [state, viewingHistoryIndex]);

  const historyToLive = useCallback(() => setViewingHistoryIndex(null), []);

  const historyJumpTo = useCallback((index: number) => {
    if (!state) return;
    if (index < 0 || index >= state.history.length) return;
    setViewingHistoryIndex(index === state.history.length - 1 ? null : index);
  }, [state]);

  return {
    loading,
    error,
    game,
    state,
    myPlayerNumber,
    opponent,
    isPlaying,
    isMyTurn,
    viewingHistoryIndex,
    clickCell,
    rotateAntTo,
    endTurn,
    switchToShieldedPiece,
    switchToShieldingButterfly,
    resign,
    toggleReady,
    iAmReady,
    opponentReady,
    historyBack,
    historyForward,
    historyToLive,
    historyJumpTo,
  };
}
