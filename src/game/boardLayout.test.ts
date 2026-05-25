// Board-layout helper tests. Node's built-in runner; run with:
//
//   npx tsx --test src/game/boardLayout.test.ts
//
// These pin the pure functions GameBoard and BoardCell share to build per-cell
// props. The correctness that matters for the render optimization: an ant
// occupies its centre + wings (so wing cells find the ant), the main/overlay
// pick matches the old in-cell logic, and the valid-move set keys line up with
// cellKey — otherwise a cell could silently stop showing a dot or a selection.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { piece, makeState } from './testHelpers';
import {
  cellKey, buildCellPieceMap, pickMainPiece, pickOverlayPiece, buildValidMoveSet, NO_PIECES,
} from './boardLayout';

test('cellKey is the stable "row,col" string used everywhere', () => {
  assert.equal(cellKey(0, 0), '0,0');
  assert.equal(cellKey(15, 7), '15,7');
});

test('buildCellPieceMap places a non-ant on its own square only', () => {
  const lion = piece({ id: 'L', type: 'lion', player: 1, row: 5, col: 5 });
  const map = buildCellPieceMap([lion]);
  assert.deepEqual(map.get('5,5'), [lion]);
  assert.equal(map.get('5,6'), undefined);
});

test('buildCellPieceMap spreads an ant across centre + both wings', () => {
  // Horizontal ant at (8,5) → wings at (8,4) and (8,6), centre (8,5).
  const ant = piece({ id: 'A', type: 'ant', player: 1, row: 8, col: 5, orientation: 'horizontal' });
  const map = buildCellPieceMap([ant]);
  assert.deepEqual(map.get('8,4'), [ant]);
  assert.deepEqual(map.get('8,5'), [ant]);
  assert.deepEqual(map.get('8,6'), [ant]);
  assert.equal(map.get('8,7'), undefined);
});

test('buildCellPieceMap stacks co-located pieces in piece order', () => {
  // A shielded stack: shielded piece + the butterfly shielding it share a cell.
  const shielded = piece({ id: 'E', type: 'elephant', player: 1, row: 4, col: 4, shieldedBy: 'B' });
  const butterfly = piece({ id: 'B', type: 'butterfly', player: 1, row: 4, col: 4, shielding: 'E' });
  const map = buildCellPieceMap([shielded, butterfly]);
  assert.deepEqual(map.get('4,4'), [shielded, butterfly]);
});

test('pickMainPiece prefers the non-overlay piece; pickOverlayPiece finds the overlay', () => {
  const shielded = piece({ id: 'E', type: 'elephant', player: 1, row: 4, col: 4, shieldedBy: 'B' });
  const butterfly = piece({ id: 'B', type: 'butterfly', player: 1, row: 4, col: 4, shielding: 'E' });
  const here = [shielded, butterfly];
  assert.equal(pickMainPiece(here)?.id, 'E');       // the protected piece is the "main"
  assert.equal(pickOverlayPiece(here)?.id, 'B');    // the butterfly is the overlay
});

test('pickMainPiece falls back to the first piece when none is an overlay', () => {
  const lion = piece({ id: 'L', type: 'lion', player: 1, row: 5, col: 5 });
  assert.equal(pickMainPiece([lion])?.id, 'L');
  assert.equal(pickMainPiece(NO_PIECES), undefined);
  assert.equal(pickOverlayPiece([lion]), undefined);
});

test('buildValidMoveSet keys match cellKey for O(1) lookup', () => {
  const set = buildValidMoveSet([{ row: 14, col: 1 }, { row: 13, col: 2 }]);
  assert.equal(set.has(cellKey(14, 1)), true);
  assert.equal(set.has(cellKey(13, 2)), true);
  assert.equal(set.has(cellKey(0, 0)), false);
});

test('the map agrees with a full starting position (ant wings included)', () => {
  // Sanity check against a real opening: every ant cell resolves to that ant,
  // and an empty square resolves to nothing.
  const state = makeState([
    piece({ id: 'A', type: 'ant', player: 1, row: 15, col: 5, orientation: 'horizontal' }),
    piece({ id: 'L', type: 'lion', player: 1, row: 15, col: 1 }),
  ]);
  const map = buildCellPieceMap(state.pieces);
  assert.equal(pickMainPiece(map.get('15,4') ?? NO_PIECES)?.id, 'A'); // wing
  assert.equal(pickMainPiece(map.get('15,5') ?? NO_PIECES)?.id, 'A'); // centre
  assert.equal(pickMainPiece(map.get('15,1') ?? NO_PIECES)?.id, 'L');
  assert.equal(map.get('0,0'), undefined);
});
