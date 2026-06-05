// Rank-tier tests. Node's built-in runner:
//
//   npx tsx --test src/game/ranks.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { rankFor } from './ranks';

test('rankFor picks the tier whose floor the rating clears', () => {
  assert.equal(rankFor(1000).tier.label, 'Newcomer');
  assert.equal(rankFor(1049).tier.label, 'Newcomer');
  assert.equal(rankFor(1050).tier.label, 'Defender');
  assert.equal(rankFor(1300).tier.label, 'Warrior');
  assert.equal(rankFor(1400).tier.label, 'Lion Tamer');
  assert.equal(rankFor(2000).tier.label, 'Throne Holder');
});

test('progress + toNext are measured toward the next tier', () => {
  // Halfway from Defender (1050) to Warrior (1200) is 1125.
  const mid = rankFor(1125);
  assert.equal(mid.tier.label, 'Defender');
  assert.equal(mid.next?.label, 'Warrior');
  assert.ok(Math.abs(mid.progress - 0.5) < 1e-9);
  assert.equal(mid.toNext, 75);
});

test('the top tier has no next and full progress', () => {
  const top = rankFor(1700);
  assert.equal(top.next, null);
  assert.equal(top.progress, 1);
  assert.equal(top.toNext, 0);
});
