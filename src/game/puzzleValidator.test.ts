// Puzzle validator tests. Uses Node's built-in test runner so we don't
// take on a Jest/Vitest dependency just for this file. To run:
//
//   npx tsx --test src/game/puzzleValidator.test.ts
//
// (`tsx` is the simplest way to run a TS test under node:test; it's not
// listed as a devDep yet — install with `npm i -D tsx` when you want to
// actually execute these. The file itself is also useful as living
// documentation of the validation contract.)

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import type { GamePiece } from './types';
import type { PuzzleSnapshotV1, AttackerMove } from './puzzleTypes';
import { validatePuzzle, isCurrentEngineVersion } from './puzzleValidator';
import { ENGINE_VERSION } from './engineVersion';

// ─── Helpers ─────────────────────────────────────────────────────────────

function piece(over: Partial<GamePiece> & Pick<GamePiece, 'id' | 'type' | 'player' | 'row' | 'col'>): GamePiece {
  return {
    hp: over.type === 'elephant' ? 2 : 1,
    isDamaged: false,
    isParalyzed: false,
    orientation: over.type === 'ant' ? 'horizontal' : undefined,
    ...over,
  };
}

function snapshot(sideToMove: 1 | 2, pieces: GamePiece[]): PuzzleSnapshotV1 {
  return { v: 1, sideToMove, pieces };
}

// ─── 1) Legal forced kill — 1-ply mate ───────────────────────────────────

test('legal forced kill validates (1-ply mate)', () => {
  // Attacker lion adjacent to defender lion. Lion kills any (KILL_TARGET
  // for lion = 'any'), so a single move kills the enemy lion outright.
  const snap = snapshot(1, [
    piece({ id: 'p1_lion', type: 'lion', player: 1, row: 5, col: 5 }),
    piece({ id: 'p2_lion', type: 'lion', player: 2, row: 4, col: 5 }),
  ]);
  const line: AttackerMove[] = [
    { pieceId: 'p1_lion', target: { row: 4, col: 5 } },
  ];

  const result = validatePuzzle({ snapshot: snap, claimedAttackerLine: line });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok) {
    assert.equal(result.solutionTree.type, 'attacker');
    if (result.solutionTree.type === 'attacker') {
      // One defender branch with reply=null and a KillNode beyond it.
      assert.equal(result.solutionTree.defenderBranches.length, 1);
      assert.equal(result.solutionTree.defenderBranches[0].reply, null);
      assert.equal(result.solutionTree.defenderBranches[0].next.type, 'kill');
    }
    assert.equal(result.principalLine.length, 1);
    assert.equal(result.principalLine[0].side, 'attacker');
    assert.equal(result.engineVersion, ENGINE_VERSION);
  }
});

// ─── 2) Illegal attacker move ────────────────────────────────────────────

test('illegal attacker move fails', () => {
  // Attacker lion at (5,5). Claim a move to (10,10) — nowhere near a
  // legal lion target. Validator must refuse without crashing.
  const snap = snapshot(1, [
    piece({ id: 'p1_lion', type: 'lion', player: 1, row: 5, col: 5 }),
    piece({ id: 'p2_lion', type: 'lion', player: 2, row: 0, col: 0 }),
  ]);
  const line: AttackerMove[] = [
    { pieceId: 'p1_lion', target: { row: 10, col: 10 } },
  ];

  const result = validatePuzzle({ snapshot: snap, claimedAttackerLine: line });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'illegal-attacker');
});

// ─── 3) Defender escape (mate-in-2 attempt that actually loses) ──────────

test('defender escape fails with the escape line', () => {
  // Attacker plays lion to (9,10) hoping to follow up with (8,10) for
  // the kill. But the defender's lion can immediately kill the attacker
  // lion right back (lion adjacent → lion kills any). That defender
  // reply ends the game with the WRONG winner, so the proof must fail
  // and the validator must surface the escape.
  const snap = snapshot(1, [
    piece({ id: 'p1_lion', type: 'lion', player: 1, row: 10, col: 10 }),
    piece({ id: 'p2_lion', type: 'lion', player: 2, row: 8,  col: 10 }),
  ]);
  const line: AttackerMove[] = [
    { pieceId: 'p1_lion', target: { row: 9, col: 10 } },
    { pieceId: 'p1_lion', target: { row: 8, col: 10 } },
  ];

  const result = validatePuzzle({ snapshot: snap, claimedAttackerLine: line });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'defender-escapes');
    assert.ok(result.escapeLine && result.escapeLine.length > 0,
      'escape line should be populated when defender escapes');
  }
});

// ─── 4) Stalemate-with-lion-alive ────────────────────────────────────────

test('stalemate-with-lion-alive fails', () => {
  // Construct a position where after the attacker's move, the defender
  // has zero legal replies but their lion is still alive — that's the
  // explicitly-disallowed "stalemate as win". The validator must reject
  // with reason='defender-stalemate'.
  //
  // Setup:
  //   Defender lion at (0,0). Lion's only escapes are (1,0) and (0,1).
  //   Defender ant at (1,1) horizontal — wings at (1,0) and (1,2) block
  //     (1,0) for the lion via isAntWingAt. Mark ant paralyzed so it
  //     can't move/rotate either.
  //   Defender butterfly at (0,1), paralyzed — own piece blocks (0,1)
  //     for the lion (own pieces aren't attackable).
  //   Attacker lion far away at (15,15) so the attacker's move is
  //     trivially legal and doesn't affect defender's legal-move set.
  //
  // Attacker moves lion (15,15) → (15,14). Defender to move with no
  // legal options, lion alive → stalemate.
  const snap = snapshot(1, [
    piece({ id: 'p1_lion',  type: 'lion',      player: 1, row: 15, col: 15 }),
    piece({ id: 'p2_lion',  type: 'lion',      player: 2, row: 0,  col: 0  }),
    piece({ id: 'p2_ant',   type: 'ant',       player: 2, row: 1,  col: 1, isParalyzed: true, orientation: 'horizontal' }),
    piece({ id: 'p2_btfly', type: 'butterfly', player: 2, row: 0,  col: 1, isParalyzed: true }),
  ]);
  const line: AttackerMove[] = [
    { pieceId: 'p1_lion', target: { row: 15, col: 14 } },
  ];

  const result = validatePuzzle({ snapshot: snap, claimedAttackerLine: line });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'defender-stalemate');
});

// ─── 5) Engine version stamp ─────────────────────────────────────────────

test('engine version mismatch hides puzzle', () => {
  assert.equal(isCurrentEngineVersion(ENGINE_VERSION), true);
  assert.equal(isCurrentEngineVersion('0.0.0'), false);
  assert.equal(isCurrentEngineVersion(null), false);
  assert.equal(isCurrentEngineVersion(undefined), false);
});

// ─── 6) Empty line fails fast ────────────────────────────────────────────

test('empty claimed line fails fast', () => {
  const snap = snapshot(1, [
    piece({ id: 'p1_lion', type: 'lion', player: 1, row: 5, col: 5 }),
    piece({ id: 'p2_lion', type: 'lion', player: 2, row: 0, col: 0 }),
  ]);
  const result = validatePuzzle({ snapshot: snap, claimedAttackerLine: [] });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'empty-line');
});
