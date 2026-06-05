// Tests for the pure UI-interaction reducers (selection, ant lock/revert,
// shield switching, rotate, end turn). These used to be inline inside
// useGame's setState callbacks and were only reachable through the React UI;
// pulling them into interactions.ts lets us pin the fiddly selection rules
// directly. Run with: npx tsx --test src/game/interactions.test.ts
//
// Behaviour here mirrors the engine the board drives, so a failure is a real
// interaction regression, not a fixture quirk.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  reduceCellClick,
  reduceRotateAntTo,
  reduceEndTurn,
  reduceSwitchToShieldedPiece,
  reduceSwitchToShieldingButterfly,
  historyReviewState,
} from './interactions';
import { piece, makeState } from './testHelpers';
import type { GameState } from './types';

const farLions = () => [
  piece({ id: 'L1', type: 'lion', player: 1, row: 15, col: 0 }),
  piece({ id: 'L2', type: 'lion', player: 2, row: 0, col: 15 }),
];

// ─── Selection ──────────────────────────────────────────────────────────────
test('clicking an own piece selects it and surfaces its valid moves', () => {
  const s = makeState(farLions());
  const after = reduceCellClick(s, 15, 0);
  assert.equal(after.selectedPieceId, 'L1');
  assert.ok(after.validMoves.length > 0);
});

test('clicking an empty cell with nothing selected leaves no selection', () => {
  const s = makeState(farLions());
  const after = reduceCellClick(s, 8, 3);
  assert.equal(after.selectedPieceId, null);
  assert.equal(after.validMoves.length, 0);
});

test('clicking an empty non-target cell with a piece selected deselects it', () => {
  const s = makeState(farLions());
  const selected = reduceCellClick(s, 15, 0);
  assert.equal(selected.selectedPieceId, 'L1');
  // (0,0) is not a legal lion move from (15,0): deselect.
  const after = reduceCellClick(selected, 0, 0);
  assert.equal(after.selectedPieceId, null);
});

test('clicking a valid target after selecting executes the move', () => {
  const s = makeState(farLions());
  const selected = reduceCellClick(s, 15, 0);
  const after = reduceCellClick(selected, 14, 0);
  assert.equal(after.pieces.find(p => p.id === 'L1')!.row, 14);
  assert.equal(after.currentPlayer, 2); // turn flipped
});

// ─── Guards ───────────────────────────────────────────────────────────────
test('clicks are ignored while reviewing history', () => {
  const s: GameState = { ...makeState(farLions()), viewingHistoryIndex: 0 };
  const after = reduceCellClick(s, 15, 0);
  assert.equal(after, s); // unchanged reference
});

test('vs-AI: board clicks are ignored on the AI (player 2) turn', () => {
  const s: GameState = { ...makeState(farLions(), 2), aiLevel: 'lion' };
  const after = reduceCellClick(s, 0, 15);
  assert.equal(after, s);
});

test('clicks are ignored once the game is won', () => {
  const s: GameState = { ...makeState(farLions()), phase: 'won', winner: 1 };
  const after = reduceCellClick(s, 15, 0);
  assert.equal(after, s);
});

// ─── Ant attack lock + revert ────────────────────────────────────────────────
test('after an ant attacks, every cell click is refused (attack lock)', () => {
  const s: GameState = {
    ...makeState([
      piece({ id: 'A1', type: 'ant', player: 1, row: 5, col: 5 }),
      ...farLions(),
    ]),
    selectedPieceId: 'A1',
    antMovedThisTurn: true,
    antAttackedThisTurn: true,
  };
  const after = reduceCellClick(s, 6, 6);
  assert.equal(after, s);
});

test('an ant that only moved can be snapped back to its origin by clicking away', () => {
  const moved = makeState([
    piece({ id: 'A1', type: 'ant', player: 1, row: 4, col: 5 }), // already slid up from (8,5)
    ...farLions(),
  ]);
  const s: GameState = {
    ...moved,
    selectedPieceId: 'A1',
    antMovedThisTurn: true,
    antAttackedThisTurn: false,
    antOriginalPosition: { row: 8, col: 5 },
  };
  const after = reduceCellClick(s, 0, 0); // empty, not mine → "changed my mind"
  const ant = after.pieces.find(p => p.id === 'A1')!;
  assert.equal(ant.row, 8);
  assert.equal(ant.col, 5);
  assert.equal(after.antMovedThisTurn, false);
  assert.equal(after.selectedPieceId, null);
});

// ─── Shielded-stack selection preference ─────────────────────────────────────
test('clicking a shielded stack selects the shielded piece, not the butterfly', () => {
  const s = makeState([
    piece({ id: 'BF1', type: 'butterfly', player: 1, row: 5, col: 5, shielding: 'E1' }),
    piece({ id: 'E1', type: 'elephant', player: 1, row: 5, col: 5, shieldedBy: 'BF1' }),
    ...farLions(),
  ]);
  const after = reduceCellClick(s, 5, 5);
  assert.equal(after.selectedPieceId, 'E1');
});

test('switch helpers flip selection between a shielded piece and its butterfly', () => {
  const base = makeState([
    piece({ id: 'BF1', type: 'butterfly', player: 1, row: 5, col: 5, shielding: 'E1' }),
    piece({ id: 'E1', type: 'elephant', player: 1, row: 5, col: 5, shieldedBy: 'BF1' }),
    ...farLions(),
  ]);
  const onButterfly: GameState = { ...base, selectedPieceId: 'BF1' };
  assert.equal(reduceSwitchToShieldedPiece(onButterfly).selectedPieceId, 'E1');

  const onShielded: GameState = { ...base, selectedPieceId: 'E1' };
  assert.equal(reduceSwitchToShieldingButterfly(onShielded).selectedPieceId, 'BF1');
});

// ─── Rotate + end turn ───────────────────────────────────────────────────────
test('rotating the selected ant updates its orientation and flags the rotation', () => {
  const base = makeState([
    piece({ id: 'A1', type: 'ant', player: 1, row: 3, col: 3, orientation: 'horizontal' }),
    ...farLions(),
  ]);
  const selected = reduceCellClick(base, 3, 3);
  const after = reduceRotateAntTo(selected, 'vertical');
  assert.equal(after.pieces.find(p => p.id === 'A1')!.orientation, 'vertical');
  assert.equal(after.antHasRotated, true);
});

test('rotateAntTo refuses an orientation that is not a valid rotation', () => {
  const base = makeState([
    piece({ id: 'A1', type: 'ant', player: 1, row: 3, col: 3, orientation: 'horizontal' }),
    piece({ id: 'BL', type: 'butterfly', player: 1, row: 2, col: 3 }), // blocks vertical
    ...farLions(),
  ]);
  const selected = reduceCellClick(base, 3, 3);
  assert.equal(selected.validRotations.includes('vertical'), false);
  const after = reduceRotateAntTo(selected, 'vertical');
  assert.equal(after.pieces.find(p => p.id === 'A1')!.orientation, 'horizontal'); // unchanged
});

// ─── History review state ────────────────────────────────────────────────────
test('historyReviewState returns the live state when not reviewing', () => {
  const s = makeState(farLions());
  assert.equal(historyReviewState(s, null), s); // same reference
});

test('historyReviewState overlays the chosen snapshot and clears selection', () => {
  const base = makeState(farLions());
  // Make a move so there is a second snapshot to review back to.
  const moved = reduceCellClick(reduceCellClick(base, 15, 0), 14, 0);
  const reviewIndex = 0; // the starting position
  const view = historyReviewState({ ...moved, selectedPieceId: 'L1' }, reviewIndex);
  // Pieces come from the snapshot (lion back at its start), selection blanked.
  assert.equal(view.pieces.find(p => p.id === 'L1')!.row, 15);
  assert.equal(view.selectedPieceId, null);
  assert.equal(view.validMoves.length, 0);
  assert.equal(view.bounceEffect, undefined);
});

test('endTurn flips the player only after the ant has acted', () => {
  const base = makeState([
    piece({ id: 'A1', type: 'ant', player: 1, row: 3, col: 3, orientation: 'horizontal' }),
    ...farLions(),
  ]);
  const selected = reduceCellClick(base, 3, 3);
  // No action yet → endTurn is a no-op.
  assert.equal(reduceEndTurn(selected), selected);
  // After a rotation, endTurn flips to player 2.
  const rotated = reduceRotateAntTo(selected, 'vertical');
  assert.equal(reduceEndTurn(rotated).currentPlayer, 2);
});
