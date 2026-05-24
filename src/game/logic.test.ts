// Core engine rule tests. Node's built-in runner (no Jest/Vitest); run with:
//
//   npx tsx --test src/game/logic.test.ts
//
// These pin the rules the whole game (and now the server-authoritative
// online path) depends on: movement, the kill cycle, the special-piece
// mechanics (elephant 2-HP + cooldown, bat paralysis, butterfly shield,
// monkey jump/kill), barriers/wings as blockers, and turn/win/history
// bookkeeping. Positions were checked against the live engine before being
// committed, so a failure here means a real rule regression — not a flaky
// fixture.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { applyMove } from './logic';
import { canPieceKill, isThrone, isBarrier } from './constants';
import type { PieceType } from './types';
import {
  piece, makeState, getPieceAt, legalTargets, legalRotations,
  expectLegalMove, expectIllegalMove,
} from './testHelpers';

// A far-apart pair of lions to drop into positions that would otherwise have
// no lions (the engine and AI both assume each side has one).
const farLions = () => [
  piece({ id: 'L1', type: 'lion', player: 1, row: 15, col: 0 }),
  piece({ id: 'L2', type: 'lion', player: 2, row: 0, col: 15 }),
];

// ─── Kill cycle ────────────────────────────────────────────────────────────
test('kill cycle: each piece kills exactly its prey (lion kills any)', () => {
  // Monkey → Bat → Butterfly → Ant → Elephant → Lion; Lion → any.
  const prey: Record<Exclude<PieceType, 'lion'>, PieceType> = {
    monkey: 'bat',
    bat: 'butterfly',
    butterfly: 'ant',
    ant: 'elephant',
    elephant: 'lion',
  };
  const all: PieceType[] = ['lion', 'elephant', 'ant', 'butterfly', 'bat', 'monkey'];
  for (const [attacker, target] of Object.entries(prey) as [Exclude<PieceType, 'lion'>, PieceType][]) {
    assert.equal(canPieceKill(attacker, target), true, `${attacker} should kill ${target}`);
    // It must NOT kill anything else.
    for (const other of all) {
      if (other === target) continue;
      assert.equal(canPieceKill(attacker, other), false, `${attacker} should NOT kill ${other}`);
    }
  }
  for (const t of all) assert.equal(canPieceKill('lion', t), true, `lion should kill ${t}`);
});

// ─── Lion ────────────────────────────────────────────────────────────────
test('lion moves one orthogonal step', () => {
  const s = makeState(farLions());
  expectLegalMove(s, 'L1', 14, 0); // up
  expectIllegalMove(s, 'L1', 13, 0); // two steps is illegal
  expectIllegalMove(s, 'L1', 14, 1); // diagonal is illegal
});

test('lion stepping onto the throne wins the game', () => {
  const s = makeState([
    piece({ id: 'L1', type: 'lion', player: 1, row: 7, col: 6 }),
    piece({ id: 'L2', type: 'lion', player: 2, row: 0, col: 0 }),
  ]);
  assert.ok(isThrone(7, 7));
  expectLegalMove(s, 'L1', 7, 7);
  const after = applyMove(s, 'L1', 7, 7);
  assert.equal(after.phase, 'won');
  assert.equal(after.winner, 1);
});

test('lion kills any adjacent enemy (kill-any) and wins by removing the enemy lion', () => {
  const s = makeState([
    piece({ id: 'L1', type: 'lion', player: 1, row: 5, col: 5 }),
    piece({ id: 'L2', type: 'lion', player: 2, row: 5, col: 6 }),
  ]);
  expectLegalMove(s, 'L1', 5, 6);
  const after = applyMove(s, 'L1', 5, 6);
  assert.equal(after.pieces.find(p => p.id === 'L2'), undefined); // enemy lion gone
  assert.equal(after.phase, 'won');
  assert.equal(after.winner, 1);
});

// ─── Barriers / ant wings as blockers ───────────────────────────────────────
test('a barrier square blocks lion movement', () => {
  assert.ok(isBarrier(9, 6));
  const s = makeState([
    piece({ id: 'L1', type: 'lion', player: 1, row: 8, col: 6 }),
    ...farLions().slice(1),
  ]);
  expectIllegalMove(s, 'L1', 9, 6);
});

test('an enemy ant wing is an impassable barrier', () => {
  // p2 ant horizontal at (5,7) → wings at (5,6) and (5,8).
  const s = makeState([
    piece({ id: 'L1', type: 'lion', player: 1, row: 5, col: 5 }),
    piece({ id: 'A2', type: 'ant', player: 2, row: 5, col: 7, orientation: 'horizontal' }),
    piece({ id: 'L2', type: 'lion', player: 2, row: 0, col: 0 }),
  ]);
  expectIllegalMove(s, 'L1', 5, 6); // can't step onto the wing
});

// ─── Elephant: 2 HP and cooldown ────────────────────────────────────────────
test('elephant takes two hits: first damages, second kills', () => {
  const s = makeState([
    piece({ id: 'L1', type: 'lion', player: 1, row: 5, col: 5 }),
    piece({ id: 'E2', type: 'elephant', player: 2, row: 4, col: 5 }),
    piece({ id: 'L2', type: 'lion', player: 2, row: 0, col: 0 }),
  ]);
  const hit1 = applyMove(s, 'L1', 4, 5);
  const e = hit1.pieces.find(p => p.id === 'E2');
  assert.ok(e, 'elephant survives the first hit');
  assert.equal(e!.hp, 1);
  assert.equal(e!.isDamaged, true);
  // Attacker bounced back (didn't take the square).
  const l = hit1.pieces.find(p => p.id === 'L1')!;
  assert.equal(l.row, 5);
  assert.equal(l.col, 5);
  assert.equal(hit1.phase, 'playing');
  // Second hit kills.
  const hit2 = applyMove(hit1, 'L1', 4, 5);
  assert.equal(hit2.pieces.find(p => p.id === 'E2'), undefined);
});

test('an elephant on cooldown can move but not attack; off cooldown it can', () => {
  const onCd = makeState([
    piece({ id: 'E1', type: 'elephant', player: 1, row: 5, col: 5, cooldown: 1 }),
    piece({ id: 'L2', type: 'lion', player: 2, row: 5, col: 7 }),
    piece({ id: 'L1', type: 'lion', player: 1, row: 15, col: 0 }),
  ]);
  expectIllegalMove(onCd, 'E1', 5, 7); // attack square blocked while on cooldown
  expectLegalMove(onCd, 'E1', 5, 6);   // but it can still slide to an empty square

  const offCd = makeState([
    piece({ id: 'E1', type: 'elephant', player: 1, row: 5, col: 5, cooldown: 0 }),
    piece({ id: 'L2', type: 'lion', player: 2, row: 5, col: 7 }),
    piece({ id: 'L1', type: 'lion', player: 1, row: 15, col: 0 }),
  ]);
  expectLegalMove(offCd, 'E1', 5, 7);
});

test('attacking sets the elephant cooldown (decrements to 1 the same turn)', () => {
  const s = makeState([
    piece({ id: 'E1', type: 'elephant', player: 1, row: 5, col: 5, cooldown: 0 }),
    piece({ id: 'L2', type: 'lion', player: 2, row: 5, col: 7 }),
    piece({ id: 'L1', type: 'lion', player: 1, row: 15, col: 0 }),
  ]);
  const after = applyMove(s, 'E1', 5, 7); // elephant kills the enemy lion → wins
  assert.equal(after.phase, 'won');
  assert.equal(after.winner, 1);
  // cooldown is set to 2 on attack, then decremented once at this turn's end → 1.
  assert.equal(after.pieces.find(p => p.id === 'E1')!.cooldown, 1);
});

// ─── Bat: paralysis ──────────────────────────────────────────────────────
test('bat paralyses a non-bat enemy and the paralysed piece cannot move', () => {
  const s = makeState([
    piece({ id: 'B1', type: 'bat', player: 1, row: 5, col: 5 }),
    piece({ id: 'E2', type: 'elephant', player: 2, row: 3, col: 3 }),
    piece({ id: 'L1', type: 'lion', player: 1, row: 15, col: 0 }),
    piece({ id: 'L2', type: 'lion', player: 2, row: 0, col: 15 }),
  ]);
  expectLegalMove(s, 'B1', 3, 3);
  const after = applyMove(s, 'B1', 3, 3);
  const e = after.pieces.find(p => p.id === 'E2')!;
  const b = after.pieces.find(p => p.id === 'B1')!;
  assert.equal(e.isParalyzed, true);
  assert.equal(e.paralyzedBy, 'B1');
  assert.equal(b.paralyzing, 'E2');
  // The paralysed piece is frozen — no legal moves.
  assert.equal(legalTargets(after, 'E2').length, 0);
});

// ─── Butterfly: shielding ─────────────────────────────────────────────────
test('butterfly shields an own piece, forming a mutual link', () => {
  const s = makeState([
    piece({ id: 'BF1', type: 'butterfly', player: 1, row: 5, col: 5 }),
    piece({ id: 'E1', type: 'elephant', player: 1, row: 4, col: 4 }),
    piece({ id: 'L1', type: 'lion', player: 1, row: 15, col: 0 }),
    piece({ id: 'L2', type: 'lion', player: 2, row: 0, col: 15 }),
  ]);
  expectLegalMove(s, 'BF1', 4, 4);
  const after = applyMove(s, 'BF1', 4, 4);
  assert.equal(after.pieces.find(p => p.id === 'BF1')!.shielding, 'E1');
  assert.equal(after.pieces.find(p => p.id === 'E1')!.shieldedBy, 'BF1');
});

test('an attacker hitting a shielded stack kills the butterfly, not the piece', () => {
  // Enemy lion attacks an elephant shielded by a butterfly: the butterfly
  // absorbs the hit, the elephant survives, the lion bounces.
  const s = makeState([
    piece({ id: 'BF1', type: 'butterfly', player: 1, row: 4, col: 4, shielding: 'E1' }),
    piece({ id: 'E1', type: 'elephant', player: 1, row: 4, col: 4, shieldedBy: 'BF1' }),
    piece({ id: 'L2', type: 'lion', player: 2, row: 5, col: 4 }),
    piece({ id: 'L1', type: 'lion', player: 1, row: 15, col: 0 }),
  ], 2);
  expectLegalMove(s, 'L2', 4, 4);
  const after = applyMove(s, 'L2', 4, 4);
  assert.equal(after.pieces.find(p => p.id === 'BF1'), undefined); // butterfly died
  assert.ok(after.pieces.find(p => p.id === 'E1'));               // elephant lives
  assert.equal(after.pieces.find(p => p.id === 'L2')!.row, 5);    // attacker bounced back
});

// ─── Monkey: jump + kill ───────────────────────────────────────────────────
test('monkey jumps over an own piece and kills a bat beyond it', () => {
  const s = makeState([
    piece({ id: 'M1', type: 'monkey', player: 1, row: 5, col: 5 }),
    piece({ id: 'X1', type: 'butterfly', player: 1, row: 5, col: 6 }), // own piece in the way
    piece({ id: 'BT2', type: 'bat', player: 2, row: 5, col: 7 }),
    piece({ id: 'L1', type: 'lion', player: 1, row: 15, col: 0 }),
    piece({ id: 'L2', type: 'lion', player: 2, row: 0, col: 15 }),
  ]);
  expectLegalMove(s, 'M1', 5, 7); // jumped over the butterfly to reach the bat
  const after = applyMove(s, 'M1', 5, 7);
  assert.equal(after.pieces.find(p => p.id === 'BT2'), undefined); // bat dead
  const m = after.pieces.find(p => p.id === 'M1')!;
  assert.equal(m.row, 5);
  assert.equal(m.col, 7);
  assert.ok(after.pieces.find(p => p.id === 'X1')); // jumped-over piece untouched
});

// ─── Ant: body movement + rotation ──────────────────────────────────────────
test('ant slides its 3-cell body along a column and can move up to 4 cells', () => {
  const s = makeState([
    piece({ id: 'A1', type: 'ant', player: 1, row: 8, col: 3, orientation: 'horizontal' }),
    ...farLions(),
  ]);
  const targets = legalTargets(s, 'A1');
  // Straight up the open column for up to 4 steps.
  for (const r of [7, 6, 5, 4]) {
    assert.ok(targets.some(m => m.row === r && m.col === 3), `expected ant to reach (${r},3)`);
  }
  // 5 steps is beyond the ant's range.
  assert.equal(targets.some(m => m.row === 3 && m.col === 3), false);
});

test('ant rotations on an open square are exactly the three non-current orientations', () => {
  const s = makeState([
    piece({ id: 'A1', type: 'ant', player: 1, row: 3, col: 3, orientation: 'horizontal' }),
    ...farLions(),
  ]);
  assert.deepEqual(legalRotations(s, 'A1'), ['vertical', 'diagonal', 'antidiagonal']);
});

test('ant rotation is blocked when a rotated body cell is occupied', () => {
  // Block (2,3) and (4,3) so the ant at (3,3) cannot rotate into vertical.
  const s = makeState([
    piece({ id: 'A1', type: 'ant', player: 1, row: 3, col: 3, orientation: 'horizontal' }),
    piece({ id: 'BL', type: 'butterfly', player: 1, row: 2, col: 3 }),
    ...farLions(),
  ]);
  assert.equal(legalRotations(s, 'A1').includes('vertical'), false);
});

// ─── Turn / state bookkeeping ───────────────────────────────────────────────
test('a normal move flips the turn, advances the counter, and appends history', () => {
  const s = makeState(farLions());
  const startHistory = s.history.length;
  const after = applyMove(s, 'L1', 14, 0);
  assert.equal(after.currentPlayer, 2);
  assert.equal(after.turn, s.turn + 1);
  assert.equal(after.history.length, startHistory + 1);
});

test('applying a move for an unknown piece id is a no-op (state unchanged)', () => {
  const s = makeState(farLions());
  const after = applyMove(s, 'does_not_exist', 0, 0);
  assert.equal(after, s); // same reference — nothing was rebuilt
});

test('history snapshots are deep copies that survive later mutation', () => {
  const s = makeState(farLions());
  const after = applyMove(s, 'L1', 14, 0);
  const snap = after.history[after.history.length - 2]; // pre-move snapshot
  const snapLion = snap.pieces.find(p => p.id === 'L1')!;
  // Mutate the live piece; the snapshot must not move with it.
  const liveLion = after.pieces.find(p => p.id === 'L1')!;
  liveLion.row = 0;
  assert.notEqual(snapLion.row, 0);
});

// getPieceAt sanity (helper used across the suite).
test('getPieceAt returns the piece at a centre cell', () => {
  const s = makeState(farLions());
  assert.equal(getPieceAt(s, 15, 0)?.id, 'L1');
  assert.equal(getPieceAt(s, 1, 1), null);
});
