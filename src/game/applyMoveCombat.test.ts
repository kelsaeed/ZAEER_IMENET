// Characterization tests for the trickiest applyMove combat branches — the
// ones the original logic.test.ts didn't cover. These pin the CURRENT engine
// output exactly so the upcoming applyMove cleanup can be proven
// behaviour-preserving. Positions were traced by hand against the live engine.
// Run with: npx tsx --test src/game/applyMoveCombat.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { applyMove } from './logic';
import { piece, makeState } from './testHelpers';
import type { GameState } from './types';

const farLions = () => [
  piece({ id: 'L1', type: 'lion', player: 1, row: 15, col: 0 }),
  piece({ id: 'L2', type: 'lion', player: 2, row: 0, col: 15 }),
];

// ─── Monkey kills an enemy bat that is paralyzing one of my pieces ────────────
test('monkey kills a paralyzing enemy bat, stands adjacent, and frees the captive', () => {
  const s = makeState([
    piece({ id: 'M1', type: 'monkey', player: 1, row: 5, col: 5 }),
    // Enemy bat overlaying the piece it paralyses (same cell).
    piece({ id: 'BT2', type: 'bat', player: 2, row: 5, col: 7, paralyzing: 'V1' }),
    piece({ id: 'V1', type: 'elephant', player: 1, row: 5, col: 7, isParalyzed: true, paralyzedBy: 'BT2' }),
    ...farLions(),
  ]);
  const after = applyMove(s, 'M1', 5, 7);
  assert.equal(after.pieces.find(p => p.id === 'BT2'), undefined); // bat killed
  const v = after.pieces.find(p => p.id === 'V1')!;
  assert.equal(v.isParalyzed, false);                              // captive freed
  assert.equal(v.paralyzedBy, undefined);
  const m = after.pieces.find(p => p.id === 'M1')!;
  assert.equal(m.row, 5);
  assert.equal(m.col, 6);                                          // stood adjacent (walk-back)
  assert.equal(after.currentPlayer, 2);                           // turn flipped
});

// ─── Lunge through my OWN bat to kill the enemy it is paralyzing ──────────────
test('a piece lunges through its own paralyzing bat to kill the captive enemy', () => {
  const s = makeState([
    piece({ id: 'L1', type: 'lion', player: 1, row: 5, col: 6 }),
    piece({ id: 'B1', type: 'bat', player: 1, row: 5, col: 7, paralyzing: 'E2' }),
    piece({ id: 'E2', type: 'elephant', player: 2, row: 5, col: 7, hp: 1, isParalyzed: true, paralyzedBy: 'B1' }),
    piece({ id: 'L2', type: 'lion', player: 2, row: 0, col: 15 }),
  ]);
  const after = applyMove(s, 'L1', 5, 7);
  assert.equal(after.pieces.find(p => p.id === 'E2'), undefined);  // captive killed
  const b = after.pieces.find(p => p.id === 'B1')!;
  assert.equal(b.row, 5);
  assert.equal(b.col, 7);                                          // own bat keeps the cell
  assert.equal(b.paralyzing, undefined);                          // no longer paralyzing
  const l = after.pieces.find(p => p.id === 'L1')!;
  assert.equal(l.row, 5);
  assert.equal(l.col, 6);                                          // attacker stands adjacent
});

// ─── Bat kills a shielding butterfly, then paralyses the now-exposed piece ────
test('bat kills a shielding butterfly and paralyses the piece it was protecting', () => {
  const s = makeState([
    piece({ id: 'B1', type: 'bat', player: 1, row: 3, col: 5 }),
    piece({ id: 'BF2', type: 'butterfly', player: 2, row: 5, col: 7, shielding: 'E2' }),
    piece({ id: 'E2', type: 'elephant', player: 2, row: 5, col: 7, shieldedBy: 'BF2' }),
    ...farLions(),
  ]);
  const after = applyMove(s, 'B1', 5, 7);
  assert.equal(after.pieces.find(p => p.id === 'BF2'), undefined); // butterfly killed
  const e = after.pieces.find(p => p.id === 'E2')!;
  assert.equal(e.isParalyzed, true);                              // exposed piece paralysed
  assert.equal(e.paralyzedBy, 'B1');
  assert.equal(e.shieldedBy, undefined);                         // shield link cleared
  const b = after.pieces.find(p => p.id === 'B1')!;
  assert.equal(b.paralyzing, 'E2');
  assert.equal(b.row, 5);
  assert.equal(b.col, 7);
});

// ─── Moving a shielding butterfly releases its shield ────────────────────────
test('a butterfly that moves away drops the shield it was holding', () => {
  const s = makeState([
    piece({ id: 'BF1', type: 'butterfly', player: 1, row: 5, col: 5, shielding: 'E1' }),
    piece({ id: 'E1', type: 'elephant', player: 1, row: 5, col: 5, shieldedBy: 'BF1' }),
    ...farLions(),
  ]);
  const after = applyMove(s, 'BF1', 4, 4); // diagonal step to an empty cell
  const bf = after.pieces.find(p => p.id === 'BF1')!;
  assert.equal(bf.row, 4);
  assert.equal(bf.col, 4);
  assert.equal(bf.shielding, undefined);
  assert.equal(after.pieces.find(p => p.id === 'E1')!.shieldedBy, undefined);
});

// ─── Ant move keeps the ant selected without flipping the turn ────────────────
test('an ant move keeps the ant selected and does NOT flip the turn', () => {
  const s = makeState([
    piece({ id: 'A1', type: 'ant', player: 1, row: 3, col: 3, orientation: 'horizontal' }),
    ...farLions(),
  ]);
  const after = applyMove(s, 'A1', 5, 3); // slide its body down two cells
  assert.equal(after.currentPlayer, 1);          // turn did NOT flip
  assert.equal(after.selectedPieceId, 'A1');     // ant stays selected
  assert.equal(after.antMovedThisTurn, true);
  assert.equal(after.validMoves.length, 0);      // no further moves this turn
  const a = after.pieces.find(p => p.id === 'A1')!;
  assert.equal(a.row, 5);
  assert.equal(a.col, 3);
});

// ─── Clock: running out of time on a turn flip loses the game ─────────────────
test('a move that flips the turn while the mover is out of time loses on the clock', () => {
  const base = makeState(farLions());
  const s: GameState = {
    ...base,
    timeControl: { kind: 'clock', matchSeconds: 60, increment: 0, perMoveSeconds: 0 },
    clocks: {
      p1Seconds: 1,
      p2Seconds: 60,
      perMoveSeconds: 0,
      // Started well in the past so the elapsed time blows the 1s budget.
      startedAt: new Date(Date.now() - 5000).toISOString(),
    },
  };
  const after = applyMove(s, 'L1', 14, 0);
  assert.equal(after.phase, 'won');
  assert.equal(after.winner, 2); // player 1 (the mover) flagged → player 2 wins
});
