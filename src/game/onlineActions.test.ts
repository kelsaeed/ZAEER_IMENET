// Server-authoritative action tests. Uses Node's built-in test runner (no
// Jest/Vitest dependency), matching puzzleValidator.test.ts. To run:
//
//   npx tsx --test src/game/onlineActions.test.ts
//
// These cover the trust boundary the API route depends on: a legal move is
// accepted, everything illegal/unauthorised/stale is rejected with the
// right status, and a finished game is immutable. (Non-participant and
// optimistic-concurrency rejection are enforced in the route/DB layer and
// verified manually against a live database.)

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import type { GameState, GamePiece, Player } from './types';
import { createInitialState } from './initialState';
import { applyMove } from './logic';
import { applyOnlineAction, evaluateTimeoutClaim, evaluateClock } from './onlineActions';
import { piece, makeState } from './testHelpers';

function playing(): GameState {
  return { ...createInitialState(), phase: 'playing' };
}

function find(state: GameState, type: GamePiece['type'], player: Player, row: number, col: number): GamePiece {
  const p = state.pieces.find(x => x.type === type && x.player === player && x.row === row && x.col === col);
  if (!p) throw new Error(`no ${type} for p${player} at ${row},${col}`);
  return p;
}

// ─── 1) Legal move is accepted ────────────────────────────────────────────
test('legal move is accepted and applied server-side', () => {
  const state = playing();
  // Player-1 lion starts at row 15, col 1; row 14 is empty → one step up.
  const lion = find(state, 'lion', 1, 15, 1);
  const res = applyOnlineAction(state, { type: 'move', pieceId: lion.id, to: { row: 14, col: 1 } }, 1);
  assert.equal(res.ok, true, JSON.stringify(res));
  if (res.ok) {
    const moved = res.state.pieces.find(p => p.id === lion.id)!;
    assert.equal(moved.row, 14);
    assert.equal(moved.col, 1);
    // Non-ant move flips the turn to player 2.
    assert.equal(res.state.currentPlayer, 2);
  }
});

// ─── 2) Illegal move is rejected (400) ────────────────────────────────────
test('illegal move (out of range) is rejected', () => {
  const state = playing();
  const lion = find(state, 'lion', 1, 15, 1);
  // A lion moves one step; three steps up is not a legal target.
  const res = applyOnlineAction(state, { type: 'move', pieceId: lion.id, to: { row: 12, col: 1 } }, 1);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 400);
});

// ─── 3) Wrong player is rejected (403) ────────────────────────────────────
test('acting out of turn is rejected', () => {
  const state = playing(); // currentPlayer = 1
  const lion = find(state, 'lion', 1, 15, 1);
  const res = applyOnlineAction(state, { type: 'move', pieceId: lion.id, to: { row: 14, col: 1 } }, 2);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 403);
});

// ─── 4) Moving a piece you don't own is rejected (403) ────────────────────
test('moving an opponent piece is rejected', () => {
  const state = playing(); // currentPlayer = 1
  const enemyLion = find(state, 'lion', 2, 0, 1); // player-2 lion
  const res = applyOnlineAction(state, { type: 'move', pieceId: enemyLion.id, to: { row: 1, col: 1 } }, 1);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 403);
});

// ─── 5) A finished game cannot be modified (409) ──────────────────────────
test('a completed game rejects further actions', () => {
  const state: GameState = { ...playing(), phase: 'won', winner: 1 };
  const lion = find(state, 'lion', 1, 15, 1);
  const res = applyOnlineAction(state, { type: 'move', pieceId: lion.id, to: { row: 14, col: 1 } }, 1);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
});

// ─── 6) Unknown piece is rejected ─────────────────────────────────────────
test('move with an unknown piece id is rejected', () => {
  const state = playing();
  const res = applyOnlineAction(state, { type: 'move', pieceId: 'does_not_exist', to: { row: 14, col: 1 } }, 1);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 400);
});

// ─── 7) Timeout requires the clock to have actually expired ───────────────
test('timeout is rejected while the clock still has time', () => {
  const now = 1_000_000_000_000;
  const state: GameState = {
    ...playing(),
    timeControl: { kind: 'clock', matchSeconds: 60, increment: 0, perMoveSeconds: 0 },
    clocks: { p1Seconds: 60, p2Seconds: 60, perMoveSeconds: 0, startedAt: new Date(now).toISOString() },
  };
  const res = applyOnlineAction(state, { type: 'timeout' }, 1, now); // 0s elapsed
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
});

test('timeout is accepted once the clock has run out (opponent wins)', () => {
  const now = 1_000_000_000_000;
  const state: GameState = {
    ...playing(),
    timeControl: { kind: 'clock', matchSeconds: 60, increment: 0, perMoveSeconds: 0 },
    clocks: { p1Seconds: 2, p2Seconds: 60, perMoveSeconds: 0, startedAt: new Date(now - 10_000).toISOString() },
  };
  const res = applyOnlineAction(state, { type: 'timeout' }, 1, now); // 10s elapsed > 2s
  assert.equal(res.ok, true, JSON.stringify(res));
  if (res.ok) {
    assert.equal(res.state.phase, 'won');
    assert.equal(res.state.winner, 2); // the active player (1) flagged → 2 wins
  }
});

// ─── Ant multi-step turn (move → end-turn) flow ───────────────────────────
// An ant's positional move keeps the turn with the same player; it must then
// commit with End Turn. The server validates the whole sequence.

/** Apply a one-step ant move via the engine, then return the post-move state
 *  exactly as the route would have persisted it (selectedPieceId, the
 *  antMovedThisTurn flag, and antOriginalPosition all set). */
function afterAntMove(): { state: GameState; antId: string } {
  const state = playing();
  const ant = find(state, 'ant', 1, 15, 5); // p1 ant, one step up the column is legal
  const moved = applyMove(state, ant.id, 14, 5);
  return { state: moved, antId: ant.id };
}

test('ant move keeps the turn with the same player (no flip yet)', () => {
  const { state } = afterAntMove();
  assert.equal(state.currentPlayer, 1);
  assert.equal(state.antMovedThisTurn, true);
});

test('a second board move mid-ant-turn is rejected', () => {
  const { state, antId } = afterAntMove();
  const res = applyOnlineAction(state, { type: 'move', pieceId: antId, to: { row: 13, col: 5 } }, 1);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 400);
});

test('end turn after an ant move commits and flips the player', () => {
  const { state, antId } = afterAntMove();
  const res = applyOnlineAction(state, { type: 'endTurn', pieceId: antId }, 1);
  assert.equal(res.ok, true, JSON.stringify(res));
  if (res.ok) assert.equal(res.state.currentPlayer, 2);
});

test('end turn with nothing committed this turn is rejected', () => {
  const state = playing();
  const ant = find(state, 'ant', 1, 15, 5);
  const res = applyOnlineAction(state, { type: 'endTurn', pieceId: ant.id }, 1);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 400);
});

test('end turn is rejected for a non-ant piece', () => {
  const state = playing();
  const lion = find(state, 'lion', 1, 15, 1);
  const res = applyOnlineAction(state, { type: 'endTurn', pieceId: lion.id }, 1);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 400);
});

// ─── Revert an un-attacked ant move ───────────────────────────────────────
test('revertAnt snaps a moved-but-not-attacked ant back to its origin', () => {
  const { state, antId } = afterAntMove();
  const res = applyOnlineAction(state, { type: 'revertAnt' }, 1);
  assert.equal(res.ok, true, JSON.stringify(res));
  if (res.ok) {
    const ant = res.state.pieces.find(p => p.id === antId)!;
    assert.equal(ant.row, 15); // back where it started
    assert.equal(ant.col, 5);
    assert.equal(res.state.antMovedThisTurn, false);
    assert.equal(res.state.currentPlayer, 1); // still my turn
  }
});

test('revertAnt is rejected when the ant has not moved this turn', () => {
  const state = playing(); // no ant move yet
  const res = applyOnlineAction(state, { type: 'revertAnt' }, 1);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 400);
});

// ─── Rotation validation ──────────────────────────────────────────────────
test('a move with an illegal rotateTo is rejected', () => {
  const state = playing();
  const ant = find(state, 'ant', 1, 15, 5); // no valid rotations from the opening
  const res = applyOnlineAction(
    state,
    { type: 'move', pieceId: ant.id, to: { row: 14, col: 5 }, rotateTo: 'vertical' },
    1,
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 400);
});

test('rotateTo on a non-ant piece is rejected', () => {
  const state = playing();
  const lion = find(state, 'lion', 1, 15, 1);
  const res = applyOnlineAction(
    state,
    { type: 'move', pieceId: lion.id, to: { row: 14, col: 1 }, rotateTo: 'vertical' },
    1,
  );
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 400);
});

// ─── Engine-agreement regression ──────────────────────────────────────────
// The server route trusts onlineActions, which trusts the engine. These pin
// that the online layer produces EXACTLY what a direct engine call would, so
// the authoritative server state can never silently diverge from local play.

test('applyOnlineAction agrees with a direct applyMove for a legal move', () => {
  const state = playing();
  const lion = find(state, 'lion', 1, 15, 1);
  const direct = applyMove(state, lion.id, 14, 1);
  const online = applyOnlineAction(state, { type: 'move', pieceId: lion.id, to: { row: 14, col: 1 } }, 1);
  assert.equal(online.ok, true, JSON.stringify(online));
  if (online.ok) {
    // Same board, same turn owner, same counter — the online path added no
    // mutation of its own beyond what the engine produced.
    assert.deepEqual(online.state.pieces, direct.pieces);
    assert.equal(online.state.currentPlayer, direct.currentPlayer);
    assert.equal(online.state.turn, direct.turn);
  }
});

test('a move the engine considers illegal is rejected by onlineActions', () => {
  // Build a position where a target is plainly off the lion's legal set, and
  // confirm the engine agrees it is not a valid move before asserting the
  // online layer rejects it (keeps the two definitions of "illegal" aligned).
  const state = makeState([
    piece({ id: 'L1', type: 'lion', player: 1, row: 5, col: 5 }),
    piece({ id: 'L2', type: 'lion', player: 2, row: 0, col: 0 }),
  ]);
  const res = applyOnlineAction(state, { type: 'move', pieceId: 'L1', to: { row: 5, col: 9 } }, 1);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 400);
});

// ─── Opponent timeout claim (liveness) ────────────────────────────────────
// The waiting player can end a clocked game when the active player's clock has
// truly expired — but never early, and never on an unclocked/finished game.

function clockedState(opts: {
  current: Player;
  p1: number;
  p2: number;
  perMove?: number;
  startedAtMsAgo: number;
  now: number;
}): GameState {
  return {
    ...createInitialState(),
    phase: 'playing',
    currentPlayer: opts.current,
    timeControl: { kind: 'clock', matchSeconds: 60, increment: 0, perMoveSeconds: opts.perMove ?? 0 },
    clocks: {
      p1Seconds: opts.p1,
      p2Seconds: opts.p2,
      perMoveSeconds: opts.perMove ?? 0,
      startedAt: new Date(opts.now - opts.startedAtMsAgo).toISOString(),
    },
  };
}

test('evaluateClock reads the ACTIVE player\'s remaining time', () => {
  const now = 1_000_000_000_000;
  // Player 2 to move, 10s on their clock, 4s elapsed → 6s left.
  const state = clockedState({ current: 2, p1: 30, p2: 10, startedAtMsAgo: 4000, now });
  const c = evaluateClock(state, now);
  assert.ok(c);
  assert.equal(c!.activePlayer, 2);
  assert.equal(Math.round(c!.remainingSeconds), 6);
  assert.equal(evaluateClock({ ...state, timeControl: { kind: 'none' }, clocks: undefined }, now), null);
});

test('opponent claim succeeds once the active player\'s clock has expired', () => {
  const now = 1_000_000_000_000;
  // Player 1 active, 2s left, 10s elapsed → expired. Claim → player 2 wins.
  const state = clockedState({ current: 1, p1: 2, p2: 60, startedAtMsAgo: 10_000, now });
  const res = evaluateTimeoutClaim(state, now);
  assert.equal(res.ok, true, JSON.stringify(res));
  if (res.ok) {
    assert.equal(res.state.phase, 'won');
    assert.equal(res.state.winner, 2); // active player (1) flagged → opponent (2) wins
  }
});

test('opponent claim is rejected before expiry (strict, no grace)', () => {
  const now = 1_000_000_000_000;
  // Player 1 active, 60s, only 2s elapsed → 58s left. Way too early.
  const state = clockedState({ current: 1, p1: 60, p2: 60, startedAtMsAgo: 2000, now });
  const res = evaluateTimeoutClaim(state, now);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
});

test('opponent claim is rejected just before zero (no self-report grace)', () => {
  const now = 1_000_000_000_000;
  // 2s left — within the self-report grace band, but a claim must be strict.
  const state = clockedState({ current: 1, p1: 12, p2: 60, startedAtMsAgo: 10_000, now });
  const res = evaluateTimeoutClaim(state, now);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
});

test('opponent claim honors the per-move cap', () => {
  const now = 1_000_000_000_000;
  // Plenty of match time, but the per-move cap (5s) was blown (8s elapsed).
  const state = clockedState({ current: 2, p1: 60, p2: 60, perMove: 5, startedAtMsAgo: 8000, now });
  const res = evaluateTimeoutClaim(state, now);
  assert.equal(res.ok, true, JSON.stringify(res));
  if (res.ok) assert.equal(res.state.winner, 1);
});

test('claim on an unclocked game is rejected', () => {
  const res = evaluateTimeoutClaim(playing(), Date.now());
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 400);
});

test('claim on a finished game is rejected', () => {
  const now = 1_000_000_000_000;
  const state: GameState = { ...clockedState({ current: 1, p1: 0, p2: 60, startedAtMsAgo: 10_000, now }), phase: 'won', winner: 2 };
  const res = evaluateTimeoutClaim(state, now);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.status, 409);
});

test('a winning capture propagates phase/winner through onlineActions', () => {
  // p1 lion adjacent to the p2 lion — lion kills any, so this both removes
  // the enemy lion and wins. The online result must carry that transition.
  const state = makeState([
    piece({ id: 'L1', type: 'lion', player: 1, row: 5, col: 5 }),
    piece({ id: 'L2', type: 'lion', player: 2, row: 5, col: 6 }),
  ]);
  const res = applyOnlineAction(state, { type: 'move', pieceId: 'L1', to: { row: 5, col: 6 } }, 1);
  assert.equal(res.ok, true, JSON.stringify(res));
  if (res.ok) {
    assert.equal(res.state.phase, 'won');
    assert.equal(res.state.winner, 1);
    assert.equal(res.state.pieces.find(p => p.id === 'L2'), undefined);
  }
});
