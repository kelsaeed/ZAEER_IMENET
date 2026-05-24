// AI safety tests. Node's built-in runner; run with:
//
//   npx tsx --test src/game/ai.test.ts
//
// The AI has two sources of nondeterminism: ±noise added to leaf evals on
// the easy level, and a random tie-break among equally-best moves. These
// tests deliberately AVOID depending on a specific move choice unless the
// position has a single forced best move (a win), so they can't flake. What
// they DO guarantee is the contract the game UI relies on: the bot only ever
// returns a real, legal, in-rules move; it never acts out of turn or on a
// finished game; and it takes a free win when one exists.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { chooseAiMove } from './ai';
import { getValidMoves } from './logic';
import { createInitialState } from './initialState';
import type { GameState, AiLevel } from './types';
import { piece, makeState } from './testHelpers';

const LEVELS: AiLevel[] = ['butterfly', 'monkey', 'lion'];

/** A fresh full-army game with player 2 (the AI side) to move. */
function aiToMove(): GameState {
  return { ...createInitialState(), phase: 'playing', currentPlayer: 2 };
}

/** Assert the move names a real piece owned by `player` and lands on one of
 *  that piece's engine-legal target squares. */
function assertLegal(state: GameState, player: 1 | 2, move: { pieceId: string; target: { row: number; col: number } }) {
  const p = state.pieces.find(x => x.id === move.pieceId);
  assert.ok(p, `AI named a non-existent piece ${move.pieceId}`);
  assert.equal(p!.player, player, 'AI moved a piece it does not own');
  assert.equal(Number.isInteger(move.target.row), true);
  assert.equal(Number.isInteger(move.target.col), true);
  const legal = getValidMoves(p!, state.pieces).moves;
  assert.ok(
    legal.some(m => m.row === move.target.row && m.col === move.target.col),
    `AI target (${move.target.row},${move.target.col}) is not legal for ${move.pieceId}`,
  );
}

test('every difficulty returns a legal, well-formed move on the opening', () => {
  for (const level of LEVELS) {
    const state = aiToMove();
    const move = chooseAiMove(state, 2, level);
    assert.ok(move, `${level} returned no move on a fresh board`);
    assertLegal(state, 2, move!);
    // Ant rotations, when present, must be a real orientation string.
    if (move!.rotateTo !== undefined) {
      assert.ok(
        ['horizontal', 'vertical', 'diagonal', 'antidiagonal'].includes(move!.rotateTo),
        `bad rotateTo ${move!.rotateTo}`,
      );
    }
  }
});

test('AI returns null for a finished game', () => {
  const won: GameState = { ...aiToMove(), phase: 'won', winner: 2 };
  for (const level of LEVELS) {
    assert.equal(chooseAiMove(won, 2, level), null);
  }
});

test('AI returns null when it is not its turn', () => {
  const oppToMove: GameState = { ...aiToMove(), currentPlayer: 1 };
  for (const level of LEVELS) {
    assert.equal(chooseAiMove(oppToMove, 2, level), null);
  }
});

test('AI takes an obvious immediate win (lion onto the throne)', () => {
  // p2 lion one orthogonal step from a throne cell. Moving onto it wins, so
  // it is the unique best move (+1,000,000) — every level must pick it and
  // the tie-break can never choose otherwise.
  const state = makeState([
    piece({ id: 'L2', type: 'lion', player: 2, row: 7, col: 6 }),
    piece({ id: 'L1', type: 'lion', player: 1, row: 15, col: 1 }),
  ], 2);
  for (const level of LEVELS) {
    const move = chooseAiMove(state, 2, level);
    assert.ok(move, `${level} found no move`);
    assert.equal(move!.pieceId, 'L2', `${level} did not move the lion`);
    assert.deepEqual(move!.target, { row: 7, col: 7 }, `${level} did not step onto the throne`);
  }
});

test('a noise-free level is deterministic on a unique-best position', () => {
  // Same forced-win position: monkey level has zero eval noise and a single
  // best move, so repeated calls must return the identical choice.
  const state = makeState([
    piece({ id: 'L2', type: 'lion', player: 2, row: 7, col: 6 }),
    piece({ id: 'L1', type: 'lion', player: 1, row: 15, col: 1 }),
  ], 2);
  const first = chooseAiMove(state, 2, 'monkey');
  for (let i = 0; i < 8; i++) {
    const again = chooseAiMove(state, 2, 'monkey');
    assert.deepEqual(again, first, 'noise-free AI should be stable on a unique-best position');
  }
});

test('the chosen move is always legal across many random opening picks', () => {
  // The opening has many near-equal moves; the tie-break/noise will vary the
  // choice. Whatever it picks must still be legal — run it repeatedly to
  // exercise different branches of the tie-break.
  for (let i = 0; i < 10; i++) {
    const state = aiToMove();
    const move = chooseAiMove(state, 2, 'butterfly');
    assert.ok(move, 'no move on the opening');
    assertLegal(state, 2, move!);
  }
});
