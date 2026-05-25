// Server-authoritative online actions.
//
// This module is the single place that turns a *move intent* (what the
// client is allowed to ask for) into the *next GameState* (what actually
// gets persisted), by re-running the existing pure engine. It is
// deliberately free of React, Supabase, and `window` so it can run inside
// the API route AND be unit-tested in isolation.
//
// The route authenticates the user, loads the canonical game row, decides
// the caller's player side, and then defers every rule decision to
// applyOnlineAction(). The client never sends a full board — only the
// intent below — so it can no longer write a winning position by hand.
//
// The intent set mirrors exactly the persisted transitions the client
// used to perform locally (see the old useOnlineGame flow):
//   • move      — applyMove (the only state-changing board action)
//   • endTurn   — applyEndTurn (commits an ant's move/rotation)
//   • revertAnt — snap an un-attacked ant move back to its origin
//   • timeout   — the active player's clock ran out
// `resign` and `rematch` need game-row context (player ids / ready flags)
// and live in the route itself.

import type { GameState, Player, Orientation, Position } from './types';
import { applyMove, applyEndTurn, applyTimeout, getValidMoves } from './logic';

export type OnlineAction =
  | { type: 'move'; pieceId: string; to: Position; rotateTo?: Orientation }
  | { type: 'endTurn'; pieceId: string; rotateTo?: Orientation }
  | { type: 'revertAnt' }
  | { type: 'timeout' };

export type ActionOutcome =
  | { ok: true; state: GameState }
  | { ok: false; status: number; error: string };

/** Wall-clock skew tolerance: the active player's client fires the timeout
 *  the instant the clock visibly hits 0, but the server processes it a beat
 *  later and the two machines' clocks may disagree by a little. We accept
 *  the flag as long as the server thinks no more than this many seconds
 *  remain — generous enough to never wrongly reject a real flag-fall, tight
 *  enough that nobody can claim a timeout with real time on the clock. */
const TIMEOUT_GRACE_SECONDS = 3;

const bad = (error: string): ActionOutcome => ({ ok: false, status: 400, error });
const forbidden = (error: string): ActionOutcome => ({ ok: false, status: 403, error });

/** Validate + apply a single online action against the canonical state.
 *  `actingPlayer` is the side the authenticated caller is on (1 or 2),
 *  resolved from the game row by the route — NOT trusted from the body. */
export function applyOnlineAction(
  state: GameState,
  action: OnlineAction,
  actingPlayer: Player,
  now: number = Date.now(),
): ActionOutcome {
  // A finished/abandoned game (or a state that already resolved to a win)
  // is immutable — refuse every action so a stale or malicious client can't
  // "move" after the result is in.
  if (state.phase !== 'playing') {
    return { ok: false, status: 409, error: 'game is not in progress' };
  }
  // Every gameplay action is only legal on the acting player's own turn.
  if (state.currentPlayer !== actingPlayer) {
    return forbidden('not your turn');
  }

  switch (action.type) {
    case 'move':      return moveAction(state, action);
    case 'endTurn':   return endTurnAction(state, action);
    case 'revertAnt': return revertAction(state);
    case 'timeout':   return timeoutAction(state, actingPlayer, now);
    default:          return bad('unknown action');
  }
}

function moveAction(
  state: GameState,
  action: Extract<OnlineAction, { type: 'move' }>,
): ActionOutcome {
  const piece = state.pieces.find(p => p.id === action.pieceId);
  if (!piece) return bad('piece not found');
  if (piece.player !== state.currentPlayer) return forbidden('that piece is not yours');
  // Mid-ant-turn the ant has already used its single move — only rotate /
  // End Turn / revert remain. (Matches the client clickCell guards.)
  if (state.antMovedThisTurn || state.antAttackedThisTurn) {
    return bad('no further board move is allowed this turn');
  }

  // Optional pre-move rotation (rotate-then-move). Mirrors rotateAntTo: only
  // valid rotations are accepted and we remember the original orientation so
  // a later revert restores it.
  let working = state;
  const rotateTo = action.rotateTo;
  if (rotateTo !== undefined) {
    if (piece.type !== 'ant') return bad('only an ant can rotate');
    const { validRotations } = getValidMoves(piece, state.pieces);
    if (!validRotations.includes(rotateTo)) return bad('illegal rotation');
    const rotatedPieces = state.pieces.map(p =>
      p.id === piece.id ? { ...p, orientation: rotateTo } : p
    );
    working = {
      ...state,
      pieces: rotatedPieces,
      antHasRotated: true,
      antOriginalOrientation: state.antOriginalOrientation ?? piece.orientation,
    };
  }

  // The move itself must be in the engine's own valid-move set for this
  // piece in the (possibly rotated) working position. This is the core
  // integrity check — an arbitrary target is rejected here.
  const mover = working.pieces.find(p => p.id === action.pieceId)!;
  const { moves } = getValidMoves(mover, working.pieces);
  if (!moves.some(m => m.row === action.to.row && m.col === action.to.col)) {
    return bad('illegal move for this piece');
  }
  return { ok: true, state: applyMove(working, action.pieceId, action.to.row, action.to.col) };
}

function endTurnAction(
  state: GameState,
  action: Extract<OnlineAction, { type: 'endTurn' }>,
): ActionOutcome {
  const piece = state.pieces.find(p => p.id === action.pieceId);
  if (!piece) return bad('piece not found');
  if (piece.player !== state.currentPlayer) return forbidden('that piece is not yours');
  if (piece.type !== 'ant') return bad('only an ant ends its turn manually');

  let working = state;
  let rotatedNow = false;
  const rotateTo = action.rotateTo;
  if (rotateTo !== undefined) {
    const { validRotations } = getValidMoves(piece, state.pieces);
    if (!validRotations.includes(rotateTo)) return bad('illegal rotation');
    const rotatedPieces = state.pieces.map(p =>
      p.id === piece.id ? { ...p, orientation: rotateTo } : p
    );
    working = {
      ...state,
      pieces: rotatedPieces,
      antHasRotated: true,
      antOriginalOrientation: state.antOriginalOrientation ?? piece.orientation,
    };
    rotatedNow = true;
  }

  // The client only enables End Turn once the ant has moved or rotated.
  if (!working.antMovedThisTurn && !working.antHasRotated && !rotatedNow) {
    return bad('nothing to commit this turn');
  }
  return { ok: true, state: applyEndTurn(working) };
}

/** Reproduce the client's "I changed my mind" snap-back: an ant that moved
 *  WITHOUT attacking can be returned to its origin (taking its shielded
 *  butterfly with it) and the per-turn ant flags cleared. All the data the
 *  revert needs (antOriginalPosition/Orientation, the selected ant) is in
 *  the persisted state from the original move write. */
function revertAction(state: GameState): ActionOutcome {
  const sel = state.selectedPieceId
    ? state.pieces.find(p => p.id === state.selectedPieceId)
    : null;
  if (!sel || sel.type !== 'ant') return bad('no ant move to revert');
  if (sel.player !== state.currentPlayer) return forbidden('that piece is not yours');
  if (!state.antMovedThisTurn) return bad('the ant has not moved this turn');
  if (state.antAttackedThisTurn) return bad('cannot revert a move that attacked');

  const butterfly = sel.shieldedBy
    ? state.pieces.find(p => p.id === sel.shieldedBy)
    : null;
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

  return {
    ok: true,
    state: {
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
    },
  };
}

/** Server-side clock readout for the player whose clock is running (the
 *  active player). Pure — `now` is injected so it's testable. Returns null
 *  when the game has no chess clock. `remainingSeconds` may be negative once
 *  the flag has fallen. */
export interface ActiveClock {
  activePlayer: Player;
  remainingSeconds: number;
  perMoveExpired: boolean;
}
export function evaluateClock(state: GameState, now: number): ActiveClock | null {
  if (state.timeControl?.kind !== 'clock' || !state.clocks) return null;
  const activePlayer = state.currentPlayer;
  const elapsed = (now - new Date(state.clocks.startedAt).getTime()) / 1000;
  const matchKey = activePlayer === 1 ? 'p1Seconds' : 'p2Seconds';
  const remainingSeconds = state.clocks[matchKey] - elapsed;
  const perMoveExpired =
    state.clocks.perMoveSeconds > 0 && elapsed > state.clocks.perMoveSeconds;
  return { activePlayer, remainingSeconds, perMoveExpired };
}

function timeoutAction(state: GameState, actingPlayer: Player, now: number): ActionOutcome {
  const clock = evaluateClock(state, now);
  if (!clock) return bad('this game has no clock');
  // Only the player whose clock is running may flag their own fall — the
  // turn check above already guarantees actingPlayer === currentPlayer, so
  // the loser is always the caller. We still verify the clock truly expired
  // server-side so nobody can claim a timeout with real time remaining. The
  // grace band ACCEPTS a self-flag slightly early (the flagging client fires
  // at 0 but the server processes a beat later; clocks can disagree a little).
  if (clock.remainingSeconds > TIMEOUT_GRACE_SECONDS && !clock.perMoveExpired) {
    return { ok: false, status: 409, error: 'clock has not expired' };
  }
  return { ok: true, state: applyTimeout(state, actingPlayer) };
}

/** Opponent-claimed timeout (flag fall). Unlike self-report `timeout`, this is
 *  NOT gated to the acting player — either participant may invoke it, and the
 *  loser is ALWAYS the active player (the one whose clock is running). That's
 *  what lets the waiting player win when the active player disconnects and
 *  never sends their own timeout.
 *
 *  Strict expiry (no grace): the clock must have genuinely run out
 *  (remainingSeconds <= 0, or the per-move cap blown). Grace here would let an
 *  opponent steal the win with real time left, so we don't allow it — the
 *  client only fires a claim once it's comfortably past zero anyway. Pure;
 *  participant + race-guard checks live in the route. */
export function evaluateTimeoutClaim(state: GameState, now: number): ActionOutcome {
  if (state.phase !== 'playing') {
    return { ok: false, status: 409, error: 'game is not in progress' };
  }
  const clock = evaluateClock(state, now);
  if (!clock) return bad('this game has no clock');
  if (clock.remainingSeconds > 0 && !clock.perMoveExpired) {
    return { ok: false, status: 409, error: 'clock has not expired' };
  }
  return { ok: true, state: applyTimeout(state, clock.activePlayer) };
}
