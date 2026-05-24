// Shared test helpers for the engine / AI / onlineActions suites.
//
// This is NOT a *.test.ts file, so the `tsx --test src/game/*.test.ts`
// runner ignores it — it's a plain module imported by the test files. It
// generalises the inline `piece()` factory that puzzleValidator.test.ts and
// onlineActions.test.ts each grew independently, plus a couple of tiny
// state/board utilities so a test can spell out a position in a few lines
// instead of hand-building a full GameState.
//
// Everything here stays close to the real GameState/GamePiece types — no
// parallel board model — so a test that passes here exercises the same
// structures the engine and the server route use in production.

import { strict as assert } from 'node:assert';

import type { GamePiece, GameState, Player, Position, Orientation } from './types';
import { createInitialState } from './initialState';
import { getValidMoves } from './logic';

/** Build a piece with the engine's default hp/orientation rules, overriding
 *  whatever you pass. `id`, `type`, `player`, `row`, `col` are required; the
 *  rest default the same way `initialState.makePiece` does. */
export function piece(
  over: Partial<GamePiece> & Pick<GamePiece, 'id' | 'type' | 'player' | 'row' | 'col'>,
): GamePiece {
  return {
    hp: over.type === 'elephant' ? 2 : 1,
    isDamaged: false,
    isParalyzed: false,
    orientation: over.type === 'ant' ? 'horizontal' : undefined,
    ...over,
  };
}

/** A clean, in-progress GameState seeded with exactly `pieces`. Starts from
 *  a real `createInitialState()` (so every field is present and valid) then
 *  swaps in the test position and sets `phase:'playing'`. The history is
 *  reset to a single snapshot of the given position so history-length
 *  assertions start from a known baseline. */
export function makeState(pieces: GamePiece[], currentPlayer: Player = 1): GameState {
  const base = createInitialState();
  return {
    ...base,
    pieces,
    currentPlayer,
    phase: 'playing',
    turn: 0,
    history: [
      {
        pieces: pieces.map(p => ({ ...p })),
        currentPlayer,
        lastAction: base.lastAction,
        turn: 0,
      },
    ],
  };
}

/** The piece whose body center sits on (row, col), or null. Center-only
 *  (ant wings are not matched) — matching the combat/selection model. */
export function getPieceAt(state: GameState, row: number, col: number): GamePiece | null {
  return state.pieces.find(p => p.row === row && p.col === col) ?? null;
}

/** Legal target squares for a piece id in the given state. */
export function legalTargets(state: GameState, pieceId: string): Position[] {
  const p = state.pieces.find(x => x.id === pieceId);
  if (!p) throw new Error(`no piece with id ${pieceId}`);
  return getValidMoves(p, state.pieces).moves;
}

/** Valid ant rotations for a piece id in the given state. */
export function legalRotations(state: GameState, pieceId: string): Orientation[] {
  const p = state.pieces.find(x => x.id === pieceId);
  if (!p) throw new Error(`no piece with id ${pieceId}`);
  return getValidMoves(p, state.pieces).validRotations;
}

const has = (moves: Position[], row: number, col: number) =>
  moves.some(m => m.row === row && m.col === col);

/** Assert (row, col) is among the piece's legal targets. */
export function expectLegalMove(state: GameState, pieceId: string, row: number, col: number): void {
  const moves = legalTargets(state, pieceId);
  assert.ok(has(moves, row, col), `expected ${pieceId} → (${row},${col}) to be legal; got ${JSON.stringify(moves)}`);
}

/** Assert (row, col) is NOT among the piece's legal targets. */
export function expectIllegalMove(state: GameState, pieceId: string, row: number, col: number): void {
  const moves = legalTargets(state, pieceId);
  assert.ok(!has(moves, row, col), `expected ${pieceId} → (${row},${col}) to be illegal; got ${JSON.stringify(moves)}`);
}
