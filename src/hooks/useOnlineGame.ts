'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { submitGameAction, type GameActionBody, GameRow } from '@/lib/supabase/games';
import { useUser } from '@/hooks/useUser';
import { applyMove, applyEndTurn, applyTimeout, getValidMoves } from '@/game/logic';
import type { GameState, Player, Orientation } from '@/game/types';

interface OpponentInfo {
  id: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  /** Opponent's chosen visual theme (added in migration 0013). Drives
   *  the split-board theming — null when the column is missing on an
   *  unmigrated DB or when the join failed. */
  theme_id: string | null;
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
 * Move flow (server-authoritative):
 *   1. Player taps a cell.
 *   2. Locally compute the new state (applyMove / getValidMoves) and render
 *      it optimistically so the board feels instant.
 *   3. Submit only the move *intent* to /api/games/[id]/move. The server
 *      re-validates against the canonical state and persists the result.
 *   4. Adopt the server's authoritative state from the response; Realtime
 *      then fans the same state to the opponent. On rejection we resync
 *      from the DB row so a refused move can't leave the board out of sync.
 *
 * Selection / in-progress ant rotation stay local (updateLocal) — they're
 * never persisted, so the opponent can't act on them anyway. */
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
        async (payload) => {
          // Trust the Realtime payload when the JSON `state` column is
          // present — that avoids a DB round-trip on every move and is the
          // difference between the opponent seeing the move instantly vs.
          // ~half a second later. Fall back to a re-fetch only on the rare
          // hosts that strip large JSON columns from the broadcast.
          if (!mounted) return;
          const next = payload.new as Partial<GameRow> | undefined;
          if (next && next.state) {
            setGame(prev => {
              const incoming = next as GameRow;
              if (!prev || !prev.state) return incoming;
              // Stale echo guard: if the incoming turn is older than what we
              // already have locally (e.g. because we've optimistically
              // applied our own move and an unrelated UPDATE for ready-flags
              // is fanning out) just keep our newer state. Without this, a
              // move could briefly "snap back" while an older payload is
              // applied before the newer one arrives.
              if (incoming.state.turn < prev.state.turn) {
                return { ...incoming, state: prev.state };
              }
              // Preserve local-only selection / valid-move overlay so an
              // unrelated DB update during the player's turn doesn't wipe
              // their selection. The persistent server state still wins
              // for everything else (pieces, currentPlayer, history…).
              const sel = prev.state.selectedPieceId;
              const stillExists = sel && incoming.state.pieces.some(p => p.id === sel);
              return {
                ...incoming,
                state: {
                  ...incoming.state,
                  selectedPieceId: stillExists ? sel : null,
                  validMoves: stillExists ? prev.state.validMoves : [],
                  canRotate: stillExists ? prev.state.canRotate : false,
                  validRotations: stillExists ? prev.state.validRotations : [],
                },
              };
            });
            setViewingHistoryIndex(null);
            return;
          }
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

  // Polling safety net for the waiting room. If Realtime drops the UPDATE
  // event that fires when player 2 joins (race against the channel's
  // subscribe handshake, flaky network, etc.), the host would otherwise be
  // stuck staring at "Waiting for opponent…" forever. Cheap re-fetch every
  // 3s while status='waiting' and we stop the moment the game starts.
  useEffect(() => {
    if (!gameId) return;
    if (game?.status !== 'waiting') return;
    const supabase = getSupabaseBrowser();
    let cancelled = false;
    const id = setInterval(async () => {
      const { data } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single();
      if (cancelled || !data) return;
      const next = data as GameRow;
      // Only swap state in if something actually changed — avoids an
      // unnecessary re-render every 3s on a quiet waiting room.
      if (next.status !== 'waiting' || next.player2_id) {
        setGame(next);
      }
    }, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [gameId, game?.status]);

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
    // Try the with-theme select first. If the database hasn't had
    // migration 0013 applied yet the column doesn't exist and the
    // SELECT fails — in that case retry without theme_id so the
    // opponent profile still loads (just without their cosmetic
    // pref) and the rest of the match keeps working.
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, theme_id')
      .eq('id', opponentId)
      .single()
      .then(({ data, error }: { data: unknown; error: { message?: string } | null }) => {
        if (data) {
          setOpponent(data as OpponentInfo);
          return;
        }
        if (!error) return;
        const msg = error.message?.toLowerCase() ?? '';
        if (!msg.includes('theme_id') && !msg.includes('column')) return;
        // Column-missing fallback: refetch without theme_id and tag
        // theme_id null on the resulting object so the rest of the
        // app sees a consistent shape.
        supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .eq('id', opponentId)
          .single()
          .then(({ data: fallback }: { data: unknown }) => {
            if (fallback) {
              setOpponent({ ...(fallback as Omit<OpponentInfo, 'theme_id'>), theme_id: null });
            }
          });
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

  // ── Clock tick (online) ─────────────────────────────────────────────
  // Only the *active* player checks the timeout and writes it to the DB.
  // Without that guard both clients would race a timeout write when they
  // both see the clock visibly hit 0 in the same animation frame. The
  // realtime echo of the winner's write fans the result back to the other
  // side. We poll at 250ms — granular enough to feel responsive without
  // burning network on a row that almost never needs to flush.
  useEffect(() => {
    if (!isPlaying || !isMyTurn || !state) return;
    if (state.timeControl?.kind !== 'clock' || !state.clocks) return;
    const id = setInterval(() => {
      // Read latest game synchronously via state closure refresh.
      if (!game?.state || !game.state.clocks) return;
      const cur = game.state;
      if (cur.phase !== 'playing') return;
      const elapsed = (Date.now() - new Date(cur.clocks!.startedAt).getTime()) / 1000;
      const matchKey = cur.currentPlayer === 1 ? 'p1Seconds' : 'p2Seconds';
      const remaining = cur.clocks![matchKey] - elapsed;
      const perMoveExpired = cur.clocks!.perMoveSeconds > 0
        && elapsed > cur.clocks!.perMoveSeconds;
      if (remaining > 0 && !perMoveExpired) return;
      // Active player's flag fell — ask the server to record the timeout so
      // the opponent gets the win via Realtime. The server re-verifies the
      // clock actually expired (so nobody can claim a timeout with time
      // left) and bakes phase='won' / winner_id from applyTimeout, which
      // sets the OTHER player as the winner.
      const losing = cur.currentPlayer;
      const next = applyTimeout(cur, losing);
      // Reflect locally so the HUD flips immediately, even before Realtime
      // echoes it back.
      setGame(prev => prev ? { ...prev, state: next } : prev);
      submitGameAction(game.id, { action: 'timeout', expectedTurn: cur.turn })
        .then(res => { if (!res.ok) console.error('[online] timeout rejected', res.status, res.error); })
        .catch(err => console.error('[online] timeout write failed', err));
    }, 250);
    return () => clearInterval(id);
  }, [isPlaying, isMyTurn, state, game]);

  /** Update local React state only — no DB write. Used for selection /
   *  deselection / piece switching / in-progress ant rotation. None of
   *  those changes need to be visible to the opponent (they can't act on
   *  them anyway, since `isMyTurn` already gates their input), and
   *  *avoiding* the round trip is what makes selecting a piece feel
   *  instant instead of laggy.
   *
   *  Important: skipping the DB write also fixes the "fast play reverts
   *  my move" glitch. With the old code, every selection triggered a
   *  Realtime echo. When you moved quickly, the previous selection's
   *  echo would arrive between your move's optimistic update and its
   *  own echo, briefly snapping the board back. */
  const updateLocal = useCallback((newState: GameState) => {
    setGame(prev => prev ? { ...prev, state: newState, current_turn: newState.turn } : prev);
  }, []);

  /** Re-fetch the canonical row. Used when a submitted action is rejected
   *  (illegal/stale) so the optimistic board snaps back to the truth. */
  const resyncFromServer = useCallback(async () => {
    if (!gameId) return;
    const supabase = getSupabaseBrowser();
    const { data } = await supabase.from('games').select('*').eq('id', gameId).single();
    if (data) {
      setGame(data as GameRow);
      setViewingHistoryIndex(null);
    }
  }, [gameId]);

  /** Optimistic local update + server-authoritative submit. Use for state
   *  changes that *commit* — moves, end turn, ant move-undos, timeout —
   *  anything the opponent must see. We render `optimistic` immediately for
   *  snappiness, then send only the intent; the server re-derives the state
   *  with the real engine and returns the canonical version, which we adopt
   *  (the Realtime echo replays the same state, so it's a no-op). A rejected
   *  action triggers a resync so the board can't drift from the server. */
  const commit = useCallback(async (optimistic: GameState, body: GameActionBody) => {
    if (!game || !user) return;
    setGame(prev => prev ? { ...prev, state: optimistic, current_turn: optimistic.turn } : prev);
    const res = await submitGameAction(game.id, body);
    if (!res.ok) {
      console.error('[online] action rejected', res.status, res.error);
      await resyncFromServer();
      return;
    }
    setGame(prev => prev ? { ...prev, state: res.state, current_turn: res.state.turn } : prev);
  }, [game, user, resyncFromServer]);

  // ── Actions ───────────────────────────────────────────────────────────────
  // These mirror the local useGame actions but their results go through the
  // network. Selection / valid-move state is part of GameState so it shows
  // up correctly for the acting player; the opponent sees a no-op until
  // a real move (piece position change) happens on their Realtime feed.

  const clickCell = useCallback((row: number, col: number) => {
    if (!state || !isMyTurn) return;

    // 0. Ant attack lock: once the ant killed/damaged an enemy, the only
    //    legal follow-ups are HUD-driven (rotateAntTo / endTurn). Refuse
    //    every cell click so the player can't snap back to undo the kill,
    //    can't move the ant elsewhere, and can't switch to another piece.
    if (state.antAttackedThisTurn) return;

    // 1. Selected piece + valid move target → execute move. This commits
    //    the move (board changes the opponent must see), so it goes through
    //    the server. If the ant was rotated locally before this move, send
    //    that rotation along so the server re-derives the same result.
    if (state.selectedPieceId) {
      const isValid = state.validMoves.some(m => m.row === row && m.col === col);
      if (isValid) {
        const sel = state.pieces.find(p => p.id === state.selectedPieceId);
        const rotateTo = (sel?.type === 'ant' && state.antHasRotated) ? sel.orientation : undefined;
        commit(applyMove(state, state.selectedPieceId, row, col), {
          action: 'move',
          pieceId: state.selectedPieceId,
          to: { row, col },
          rotateTo,
          expectedTurn: state.turn,
        });
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

    // 4. Ant moved (without attacking) + clicked away → "I changed my mind".
    //    Snap the ant fully back to its origin AND clear antMovedThisTurn so
    //    the player can move it again or pick another piece. The block-0
    //    attack lock above already returns when the move was an attack, so
    //    reaching here guarantees the move was a positional change with no
    //    irreversible combat.
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
      // Reverting an ant move *moves piece positions back* — the opponent
      // had already seen the move land (we committed it), so they must also
      // see it un-land. The server reproduces this from the persisted
      // antOriginalPosition/Orientation, so we send just the intent.
      commit({
        ...state,
        pieces: reverted,
        selectedPieceId: null,
        validMoves: [],
        canRotate: false,
        validRotations: [],
        antHasRotated: false,
        antMovedThisTurn: false,
        antOriginalOrientation: undefined,
        antOriginalPosition: undefined,
      }, { action: 'revertAnt', expectedTurn: state.turn });
      return;
    }

    // 5. Deselecting / switching pieces with a pending uncommitted ant
    //    rotation → undo the rotation. Rotations are stored locally only
    //    (no DB write) so reverting them is also local.
    let pieces = state.pieces;
    if (state.selectedPieceId && state.antHasRotated && state.antOriginalOrientation) {
      pieces = state.pieces.map(p =>
        p.id === state.selectedPieceId
          ? { ...p, orientation: state.antOriginalOrientation }
          : p
      );
    }

    if (!myPiece) {
      // Pure deselect — local only.
      updateLocal({
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

    // 6. Select / re-select the piece at the clicked cell — local only.
    const freshPiece = pieces.find(p => p.id === myPiece.id)!;
    const { moves, canRotate, validRotations } = getValidMoves(freshPiece, pieces);
    const isAnt = freshPiece.type === 'ant';
    const sameSelection = myPiece.id === state.selectedPieceId;
    updateLocal({
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
  }, [state, isMyTurn, commit, updateLocal]);

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
    // Rotation is part of the in-progress ant turn — local only. The final
    // orientation is sent to the server when End Turn fires (rotateTo), or
    // when the ant moves (the move intent carries rotateTo via commit).
    updateLocal(newState);
  }, [state, isMyTurn, updateLocal]);

  const endTurn = useCallback(() => {
    if (!state || !isMyTurn || !state.selectedPieceId) return;
    const piece = state.pieces.find(p => p.id === state.selectedPieceId);
    if (!piece || piece.type !== 'ant') return;
    if (!state.antMovedThisTurn && !state.antHasRotated) return;
    // Send the committed orientation if the ant rotated this turn (the
    // rotation itself was local-only); the server validates + applies it.
    const rotateTo = state.antHasRotated ? piece.orientation : undefined;
    commit(applyEndTurn(state), {
      action: 'endTurn',
      pieceId: state.selectedPieceId,
      rotateTo,
      expectedTurn: state.turn,
    });
  }, [state, isMyTurn, commit]);

  const switchToShieldedPiece = useCallback(() => {
    if (!state || !isMyTurn || !state.selectedPieceId) return;
    const piece = state.pieces.find(p => p.id === state.selectedPieceId);
    if (!piece || piece.type !== 'butterfly' || !piece.shielding) return;
    const shielded = state.pieces.find(p => p.id === piece.shielding);
    if (!shielded) return;
    const { moves, canRotate, validRotations } = getValidMoves(shielded, state.pieces);
    // Switching which piece you're driving is selection — local only.
    updateLocal({
      ...state,
      selectedPieceId: shielded.id,
      validMoves: moves,
      canRotate,
      validRotations,
    });
  }, [state, isMyTurn, updateLocal]);

  const switchToShieldingButterfly = useCallback(() => {
    if (!state || !isMyTurn || !state.selectedPieceId) return;
    const shielded = state.pieces.find(p => p.id === state.selectedPieceId);
    if (!shielded || !shielded.shieldedBy) return;
    const butterfly = state.pieces.find(p => p.id === shielded.shieldedBy);
    if (!butterfly) return;
    const { moves, canRotate, validRotations } = getValidMoves(butterfly, state.pieces);
    updateLocal({
      ...state,
      selectedPieceId: butterfly.id,
      validMoves: moves,
      canRotate,
      validRotations,
    });
  }, [state, isMyTurn, updateLocal]);

  const resign = useCallback(async () => {
    if (!game || !user || myPlayerNumber === null || !state) return;
    if (!confirm('Resign this match?')) return;
    const winnerNumber: Player = myPlayerNumber === 1 ? 2 : 1;
    // Optimistically flip the local state to 'won' so the win screen shows
    // and clicks stop immediately; the server is the authority on the write.
    setGame(prev => prev ? {
      ...prev,
      state: { ...prev.state, phase: 'won', winner: winnerNumber, selectedPieceId: null, validMoves: [], canRotate: false, validRotations: [] },
      status: 'abandoned',
    } : prev);
    const res = await submitGameAction(game.id, { action: 'resign' });
    if (!res.ok) {
      console.error('[online] resign rejected', res.status, res.error);
      await resyncFromServer();
    }
  }, [game, user, myPlayerNumber, state, resyncFromServer]);

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

    // Flip my own ready flag directly — p1_ready/p2_ready are the only
    // columns a client may still write after the 0018 lockdown, and they
    // can't affect the board or result.
    await supabase.from('games').update({ [field]: newReady }).eq('id', game.id);

    // Once both players are ready, the actual match reset (fresh board,
    // series increment, winner/status clear) is an authoritative write, so
    // it goes through the server. The match_number guard makes a race
    // between both clients a no-op for the second caller.
    if (newReady && otherReady) {
      const res = await submitGameAction(game.id, {
        action: 'rematch',
        expectedMatchNumber: game.match_number,
      });
      if (!res.ok && res.status !== 409) {
        console.error('[online] rematch failed', res.status, res.error);
      }
    }
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
