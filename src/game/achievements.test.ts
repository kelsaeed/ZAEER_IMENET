// Achievement unlock-rule tests. Node's built-in runner:
//
//   npx tsx --test src/game/achievements.test.ts
//
// Covers the pure earned-from-game / earned-from-puzzle logic so the unlock
// conditions can't silently drift.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createInitialState } from './initialState';
import { earnedFromGame, earnedFromPuzzle } from './achievements';
import type { GameState } from './types';

/** A finished game where player 1 (the human) beat the given AI level. */
function wonState(level: GameState['aiLevel'], over: Partial<GameState> = {}): GameState {
  return { ...createInitialState(), phase: 'won', winner: 1, aiLevel: level, turn: 1, ...over };
}

test('no achievements unless the human actually won vs the AI', () => {
  assert.deepEqual(earnedFromGame(createInitialState(), 1), []); // still in menu/playing
  assert.deepEqual(earnedFromGame(wonState('lion', { winner: 2 }), 1), []); // human lost
  assert.deepEqual(earnedFromGame(wonState(null), 1), []); // pass-and-play, not vs AI
});

test('beating each AI level grants first-win + the matching rank', () => {
  assert.ok(earnedFromGame(wonState('butterfly'), 1).includes('beat-easy'));
  assert.ok(earnedFromGame(wonState('monkey'), 1).includes('beat-medium'));
  const hard = earnedFromGame(wonState('lion'), 1);
  assert.ok(hard.includes('beat-hard'));
  assert.ok(hard.includes('first-win'));
});

test('flawless requires keeping every piece; blitz requires turn <= 15', () => {
  const flawless = earnedFromGame(wonState('lion', { turn: 10 }), 1);
  assert.ok(flawless.includes('flawless'), 'fresh board = no losses');
  assert.ok(flawless.includes('blitz'), 'turn 10 is a blitz');

  // Drop one of player 1's pieces and push past the blitz window.
  const base = createInitialState();
  const lossy = wonState('lion', {
    turn: 30,
    pieces: base.pieces.filter((p, i) => !(p.player === 1 && i === base.pieces.findIndex((q) => q.player === 1))),
  });
  const earned = earnedFromGame(lossy, 1);
  assert.ok(!earned.includes('flawless'), 'lost a piece → not flawless');
  assert.ok(!earned.includes('blitz'), 'turn 30 → not a blitz');
});

test('throne win vs lion-hunt win are distinguished', () => {
  const base = createInitialState();
  // Move player 1's lion onto a throne cell (rows 7-8, cols 7-8).
  const onThrone = base.pieces.map((p) =>
    p.player === 1 && p.type === 'lion' ? { ...p, row: 7, col: 7 } : p,
  );
  assert.ok(earnedFromGame(wonState('lion', { pieces: onThrone }), 1).includes('throne'));

  // Lion not on the throne + both enemy lions removed → hunter.
  const hunted = base.pieces.filter((p) => !(p.player === 2 && p.type === 'lion'));
  const earned = earnedFromGame(wonState('lion', { pieces: hunted }), 1);
  assert.ok(earned.includes('hunter'));
  assert.ok(!earned.includes('throne'));
});

test('puzzle achievements: first solve always, clean only with zero wrong moves', () => {
  assert.deepEqual(earnedFromPuzzle(0).sort(), ['clean-puzzle', 'first-puzzle']);
  assert.deepEqual(earnedFromPuzzle(3), ['first-puzzle']);
});

test('archive solves additionally grant the archive-solve badge', () => {
  assert.deepEqual(earnedFromPuzzle(0, true).sort(), ['archive-solve', 'clean-puzzle', 'first-puzzle']);
  assert.deepEqual(earnedFromPuzzle(3, true).sort(), ['archive-solve', 'first-puzzle']);
  // Daily (non-archive) solves never grant it.
  assert.ok(!earnedFromPuzzle(0).includes('archive-solve'));
});
