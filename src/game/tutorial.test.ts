// Tutorial consistency tests. Node's built-in runner; run with:
//
//   npx tsx --test src/game/tutorial.test.ts
//
// Every interactive lesson hands the player a locked, single-solution path:
// pick the piece at `selectFrom`, move it to `moveTo`, optionally rotate to
// `rotateTo`, optionally press End Turn — and then `isComplete` must be true.
// If any of those links is broken (an illegal `moveTo`, an impossible
// rotation, an `isComplete` that the scripted path never satisfies) the
// lesson SOFTLOCKS the player with no way forward. These tests walk the
// intended happy path for every step against the real engine, so a broken
// or unsolvable lesson fails CI instead of stranding a first-time player.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { applyMove, applyEndTurn, getValidMoves } from './logic';
import { TUTORIAL_STEPS, tutorialState } from './tutorial';
import { LOCALES } from './locales';
import type { GameState } from './types';

test('every step has the required copy keys and a unique id', () => {
  const ids = new Set<string>();
  for (const step of TUTORIAL_STEPS) {
    assert.ok(step.id, 'step missing id');
    assert.equal(ids.has(step.id), false, `duplicate step id: ${step.id}`);
    ids.add(step.id);
    for (const key of ['titleKey', 'bodyKey', 'doneKey'] as const) {
      assert.ok(step[key] && step[key].startsWith('tutorial.'), `${step.id}: bad ${key}`);
    }
  }
});

test('the opening step is the UI tour and the array starts with a callout', () => {
  assert.equal(TUTORIAL_STEPS[0].id, 'tour');
  assert.equal(TUTORIAL_STEPS[0].kind, 'callout');
});

test('every step copy key resolves in all built-in locales', () => {
  // A missing key would render the raw "tutorial.x.y" string to the player.
  // Guard the two shipped languages (English + Arabic) so a new step can't
  // land with half-translated copy.
  for (const step of TUTORIAL_STEPS) {
    for (const key of [step.titleKey, step.bodyKey, step.doneKey]) {
      for (const locale of LOCALES) {
        assert.ok(
          typeof locale.strings[key] === 'string' && locale.strings[key].length > 0,
          `locale "${locale.id}" is missing key "${key}" (step ${step.id})`,
        );
      }
    }
  }
});

// Walk the scripted solution for each interactive lesson and assert it
// actually completes. Callout steps have nothing to solve and are skipped.
for (const step of TUTORIAL_STEPS) {
  if (step.kind === 'callout') continue;

  test(`lesson "${step.id}" is solvable along its scripted path`, () => {
    const s0 = tutorialState(step.pieces);

    // The player must first pick up the piece at selectFrom — it has to exist
    // and belong to the side to move, or the lesson can't even start.
    assert.ok(step.selectFrom, `${step.id}: interactive lesson needs selectFrom`);
    const actor = s0.pieces.find(
      p => p.row === step.selectFrom!.row && p.col === step.selectFrom!.col && p.player === s0.currentPlayer,
    );
    assert.ok(actor, `${step.id}: no own piece at selectFrom (${step.selectFrom!.row},${step.selectFrom!.col})`);

    // 1) The scripted move (if any) must be a legal engine move.
    let state: GameState = s0;
    if (step.moveTo) {
      const moves = getValidMoves(actor!, s0.pieces).moves;
      assert.ok(
        moves.some(m => m.row === step.moveTo!.row && m.col === step.moveTo!.col),
        `${step.id}: scripted moveTo (${step.moveTo.row},${step.moveTo.col}) is not a legal move`,
      );
      state = applyMove(s0, actor!.id, step.moveTo.row, step.moveTo.col);
    }

    // 2) The scripted rotation (if any) must be valid in the post-move state.
    if (step.rotateTo) {
      const p = state.pieces.find(x => x.id === actor!.id)!;
      assert.equal(p.type, 'ant', `${step.id}: rotateTo set on a non-ant`);
      const { validRotations } = getValidMoves(p, state.pieces);
      assert.ok(
        validRotations.includes(step.rotateTo),
        `${step.id}: scripted rotateTo "${step.rotateTo}" is not a valid rotation`,
      );
      state = {
        ...state,
        pieces: state.pieces.map(x => (x.id === p.id ? { ...x, orientation: step.rotateTo } : x)),
        antHasRotated: true,
        antOriginalOrientation: state.antOriginalOrientation ?? p.orientation,
      };
    }

    // 3) End Turn, when the lesson requires it to commit.
    if (step.endTurnCompletes) {
      state = applyEndTurn(state);
    }

    // 4) After the scripted path, the lesson's own goal check must pass.
    if (step.isComplete) {
      assert.equal(step.isComplete(state), true, `${step.id}: isComplete is false after the scripted path`);
    }
  });
}
