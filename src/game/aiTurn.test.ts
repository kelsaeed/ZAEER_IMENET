// Tests for the offline AI turn-lifecycle guards. These are the logic that
// keeps an asynchronous (Web Worker) AI result from being applied to a stale
// game — run with:
//
//   npx tsx --test src/game/aiTurn.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { createInitialState } from './initialState';
import { isAiTurn, aiResultStillApplies } from './aiTurn';
import type { GameState } from './types';

/** A vs-AI game with the bot (player 2) to move on turn 4. */
function botToMove(): GameState {
  return { ...createInitialState(), phase: 'playing', currentPlayer: 2, aiLevel: 'lion', turn: 4 };
}

test('isAiTurn: true only on the bot turn of an in-progress vs-AI game', () => {
  assert.equal(isAiTurn(botToMove()), true);
});

test('isAiTurn: false with no AI (pass-and-play)', () => {
  assert.equal(isAiTurn({ ...botToMove(), aiLevel: null }), false);
});

test('isAiTurn: false on the human turn', () => {
  assert.equal(isAiTurn({ ...botToMove(), currentPlayer: 1 }), false);
});

test('isAiTurn: false once the game is won', () => {
  assert.equal(isAiTurn({ ...botToMove(), phase: 'won', winner: 1 }), false);
});

test('isAiTurn: false while reviewing history', () => {
  assert.equal(isAiTurn({ ...botToMove(), viewingHistoryIndex: 2 }), false);
});

test('aiResultStillApplies: true when the same bot turn is still live', () => {
  const s = botToMove();
  assert.equal(aiResultStillApplies(s, 4), true);
});

test('aiResultStillApplies: false when the turn counter advanced (a move happened)', () => {
  const s = botToMove(); // turn 4
  assert.equal(aiResultStillApplies(s, 3), false); // we asked about turn 3
});

test('aiResultStillApplies: false after reset to the menu', () => {
  // createInitialState() is phase 'menu' with no aiLevel — a hard reset.
  assert.equal(aiResultStillApplies(createInitialState(), 4), false);
});

test('aiResultStillApplies: false if it became the human turn', () => {
  assert.equal(aiResultStillApplies({ ...botToMove(), currentPlayer: 1 }, 4), false);
});
