// Rate-limit decision tests. Node's built-in runner; run with:
//
//   npx tsx --test src/lib/server/rateLimit.test.ts
//
// Covers the pure window math, the in-memory store, and the checkRateLimit
// orchestration (in-memory pre-filter + fail-open DB layer). The DB RPC
// itself (migration 0019) can't be unit-tested without Postgres and is
// covered by a manual smoke check against a live database.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  evaluateFixedWindow,
  InMemoryFixedWindow,
  checkRateLimit,
  classifyAction,
  rateLimitKey,
  type RateLimitConfig,
  type RateLimitResult,
} from './rateLimit';

const cfg: RateLimitConfig = { limit: 2, windowMs: 10_000 };

// Unique ids per call so tests sharing checkRateLimit's module singleton
// never contaminate each other.
let seq = 0;
const uniqueUser = () => `user_${seq++}`;

// ─── Pure fixed-window math ────────────────────────────────────────────────
test('evaluateFixedWindow: first hit opens a window and is allowed', () => {
  const d = evaluateFixedWindow(1000, undefined, cfg);
  assert.equal(d.allowed, true);
  assert.deepEqual(d.state, { windowStartMs: 1000, count: 1 });
  assert.equal(d.retryAfterSeconds, 0);
});

test('evaluateFixedWindow: allows up to the limit, rejects beyond with retryAfter', () => {
  let state = evaluateFixedWindow(1000, undefined, cfg).state;       // count 1
  let d = evaluateFixedWindow(1500, state, cfg);                      // count 2
  assert.equal(d.allowed, true);
  state = d.state;
  d = evaluateFixedWindow(2000, state, cfg);                         // count 3 > 2
  assert.equal(d.allowed, false);
  // window opened at 1000, 10s long → resets at 11000; now 2000 → 9s.
  assert.equal(d.retryAfterSeconds, 9);
});

test('evaluateFixedWindow: a new window opens once the old one elapses', () => {
  const first = evaluateFixedWindow(1000, undefined, cfg).state;
  const over = evaluateFixedWindow(2000, { windowStartMs: 1000, count: 2 }, cfg);
  assert.equal(over.allowed, false);
  const reset = evaluateFixedWindow(11_000, first, cfg);
  assert.equal(reset.allowed, true);
  assert.deepEqual(reset.state, { windowStartMs: 11_000, count: 1 });
});

// ─── In-memory store ────────────────────────────────────────────────────────
test('InMemoryFixedWindow: allows under the limit and blocks over it', () => {
  const m = new InMemoryFixedWindow();
  assert.equal(m.hit('k', cfg, 0).allowed, true);
  assert.equal(m.hit('k', cfg, 1).allowed, true);
  const blocked = m.hit('k', cfg, 2);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test('InMemoryFixedWindow: different keys do not interfere', () => {
  const m = new InMemoryFixedWindow();
  m.hit('a', cfg, 0); m.hit('a', cfg, 0); m.hit('a', cfg, 0); // 'a' now over
  assert.equal(m.hit('a', cfg, 0).allowed, false);
  // 'b' is untouched.
  assert.equal(m.hit('b', cfg, 0).allowed, true);
});

test('InMemoryFixedWindow: the window resets after it elapses', () => {
  const m = new InMemoryFixedWindow();
  m.hit('k', cfg, 0); m.hit('k', cfg, 0);
  assert.equal(m.hit('k', cfg, 0).allowed, false);     // blocked within window
  assert.equal(m.hit('k', cfg, 10_000).allowed, true); // window elapsed → allowed
});

test('InMemoryFixedWindow: sweep drops expired entries', () => {
  const m = new InMemoryFixedWindow(60_000);
  m.hit('old', cfg, 0);
  assert.equal(m.size(), 1);
  m.sweep(60_000); // 'old' opened at 0, maxWindow 60s → expired
  assert.equal(m.size(), 0);
});

// ─── classifyAction / key shape ─────────────────────────────────────────────
test('classifyAction maps actions to classes', () => {
  for (const a of ['move', 'endTurn', 'revertAnt']) assert.equal(classifyAction(a), 'gameplay');
  for (const a of ['timeout', 'resign', 'rematch']) assert.equal(classifyAction(a), 'control');
  for (const a of ['', 'nonsense', null, undefined]) assert.equal(classifyAction(a), 'bad');
});

test('rateLimitKey scopes gameplay/control per game but bad per user', () => {
  assert.equal(rateLimitKey('u', 'g', 'gameplay'), 'u:g:gameplay');
  assert.equal(rateLimitKey('u', 'g', 'control'), 'u:g:control');
  assert.equal(rateLimitKey('u', 'g', 'bad'), 'u:bad');
});

// ─── checkRateLimit orchestration ───────────────────────────────────────────
test('checkRateLimit: allows a request under the limit', async () => {
  const r = await checkRateLimit({ userId: uniqueUser(), gameId: 'g', actionClass: 'gameplay' });
  assert.equal(r.allowed, true);
  assert.equal(r.retryAfter, 0);
});

test('checkRateLimit: different users do not block each other', async () => {
  const a = uniqueUser();
  const b = uniqueUser();
  // Exhaust 'control' (limit 5) for user a.
  let last: RateLimitResult = { allowed: true, retryAfter: 0 };
  for (let i = 0; i < 7; i++) last = await checkRateLimit({ userId: a, gameId: 'g', actionClass: 'control' });
  assert.equal(last.allowed, false);
  // User b on the same game/class is unaffected.
  const rb = await checkRateLimit({ userId: b, gameId: 'g', actionClass: 'control' });
  assert.equal(rb.allowed, true);
});

test('checkRateLimit: different games do not block each other', async () => {
  const u = uniqueUser();
  let last: RateLimitResult = { allowed: true, retryAfter: 0 };
  for (let i = 0; i < 7; i++) last = await checkRateLimit({ userId: u, gameId: 'g1', actionClass: 'control' });
  assert.equal(last.allowed, false);
  const other = await checkRateLimit({ userId: u, gameId: 'g2', actionClass: 'control' });
  assert.equal(other.allowed, true);
});

test('checkRateLimit: over the in-memory limit short-circuits before the DB hop', async () => {
  const u = uniqueUser();
  let dbCalls = 0;
  const dbHit = async (): Promise<RateLimitResult> => { dbCalls++; return { allowed: true, retryAfter: 0 }; };
  // gameplay limit is 30; the 31st must be blocked in memory and skip dbHit.
  let last: RateLimitResult = { allowed: true, retryAfter: 0 };
  for (let i = 0; i < 31; i++) last = await checkRateLimit({ userId: u, gameId: 'g', actionClass: 'gameplay', dbHit });
  assert.equal(last.allowed, false);
  assert.equal(dbCalls, 30, 'DB should be consulted only on the 30 in-memory-allowed calls');
});

test('checkRateLimit: the DB layer can block even when memory allows', async () => {
  const dbHit = async (): Promise<RateLimitResult> => ({ allowed: false, retryAfter: 7 });
  const r = await checkRateLimit({ userId: uniqueUser(), gameId: 'g', actionClass: 'gameplay', dbHit });
  assert.equal(r.allowed, false);
  assert.equal(r.retryAfter, 7);
});

test('checkRateLimit: a throwing DB layer fails open (request allowed)', async () => {
  const dbHit = async (): Promise<RateLimitResult> => { throw new Error('db down'); };
  const r = await checkRateLimit({ userId: uniqueUser(), gameId: 'g', actionClass: 'gameplay', dbHit });
  assert.equal(r.allowed, true);
});
