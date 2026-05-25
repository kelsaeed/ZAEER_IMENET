// Server-only rate limiting for gameplay API routes.
//
// Why this exists
// ---------------
// The server-authoritative move endpoint (src/app/api/games/[gameId]/move)
// re-runs the engine and writes via the service role on every action. A
// determined authed user could still spam *legal* requests — hammering the
// route, Supabase, and Realtime — without breaking any rule. This throttles
// that without touching gameplay validation.
//
// Design (two layers, one entry point — `checkRateLimit`)
// -------------------------------------------------------
//  1. In-memory fixed window (this module's singleton). Per-lambda and
//     therefore BEST-EFFORT on Vercel — but it's a zero-latency pre-filter
//     that blocks a client hammering one warm instance WITHOUT a DB round
//     trip, which is exactly what protects Supabase from a burst.
//  2. DB-backed fixed window via the `rate_limit_hit` RPC (migration 0019).
//     This is the authoritative, cross-instance limiter. The route wires it
//     in as `dbHit`; on ANY error we FAIL OPEN (allow) so an infra hiccup —
//     or deploying this code before the migration is applied — can never
//     break a live game.
//
// The window math is a pure function (`evaluateFixedWindow`) so the decision
// logic is unit-tested in isolation; the SQL RPC mirrors the same algorithm.

/** Coarse action classes — gameplay is high-frequency, control is rare, and
 *  `bad` catches malformed/unknown payloads (spam that never reaches the
 *  engine). */
export type RateLimitClass = 'gameplay' | 'control' | 'bad';

export interface RateLimitConfig {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Conservative defaults, chosen to sit far above real play:
 *  - gameplay: a blitz/bullet turn is ~1–2 requests (an ant turn is a move
 *    + End Turn); 30 per 10s ≈ 3 req/s sustained, which no human reaches but
 *    a script trivially exceeds.
 *  - control: resign/rematch/timeout each fire ~once; 5 per 30s is generous.
 *  - bad: malformed/unknown actions should be infrequent; 10 per 10s trips
 *    fast on a fuzzing client while tolerating the odd stale request. */
export const RATE_LIMITS: Record<RateLimitClass, RateLimitConfig> = {
  gameplay: { limit: 30, windowMs: 10_000 },
  control:  { limit: 5,  windowMs: 30_000 },
  bad:      { limit: 10, windowMs: 10_000 },
};

export interface WindowState {
  /** Epoch ms when the current window opened. */
  windowStartMs: number;
  /** Requests counted in the current window (including this one). */
  count: number;
}

export interface WindowDecision {
  allowed: boolean;
  /** The window state to persist after this hit. */
  state: WindowState;
  /** Seconds until the window resets (0 when allowed). */
  retryAfterSeconds: number;
}

/** Pure fixed-window decision. Given the previous window state (or undefined
 *  for a first hit), decide whether THIS request is allowed and what the new
 *  state is. No clocks, no storage — fully deterministic for tests. */
export function evaluateFixedWindow(
  now: number,
  prev: WindowState | undefined,
  cfg: RateLimitConfig,
): WindowDecision {
  // Fresh window if there's no prior state or the old one has elapsed.
  if (!prev || now - prev.windowStartMs >= cfg.windowMs) {
    const state: WindowState = { windowStartMs: now, count: 1 };
    return { allowed: 1 <= cfg.limit, state, retryAfterSeconds: 0 };
  }
  const count = prev.count + 1;
  const state: WindowState = { windowStartMs: prev.windowStartMs, count };
  if (count <= cfg.limit) {
    return { allowed: true, state, retryAfterSeconds: 0 };
  }
  const resetAt = prev.windowStartMs + cfg.windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
  return { allowed: false, state, retryAfterSeconds };
}

/** Per-instance fixed-window store. Best-effort (memory is per-lambda), used
 *  only as the fast pre-filter. Sweeps expired entries opportunistically so
 *  the Map can't grow without bound on a long-lived instance. */
export class InMemoryFixedWindow {
  private windows = new Map<string, WindowState>();
  /** Longest window we track — anything older is definitely expired. */
  private readonly maxWindowMs: number;
  private readonly sweepEvery: number;
  private hits = 0;

  constructor(maxWindowMs = 60_000, sweepEvery = 500) {
    this.maxWindowMs = maxWindowMs;
    this.sweepEvery = sweepEvery;
  }

  hit(key: string, cfg: RateLimitConfig, now: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    if (++this.hits % this.sweepEvery === 0) this.sweep(now);
    const decision = evaluateFixedWindow(now, this.windows.get(key), cfg);
    this.windows.set(key, decision.state);
    return { allowed: decision.allowed, retryAfterSeconds: decision.retryAfterSeconds };
  }

  /** Drop windows whose newest possible reset has already passed. */
  sweep(now: number = Date.now()): void {
    const expired: string[] = [];
    this.windows.forEach((state, key) => {
      if (now - state.windowStartMs >= this.maxWindowMs) expired.push(key);
    });
    for (const key of expired) this.windows.delete(key);
  }

  /** Test/util: current number of tracked keys. */
  size(): number {
    return this.windows.size;
  }
}

/** Build the bucket key. Gameplay/control are scoped per user+game so a busy
 *  match never bleeds into another; `bad` is per-user (game-agnostic) so a
 *  client spraying malformed payloads across rooms is still caught. */
export function rateLimitKey(userId: string, gameId: string, cls: RateLimitClass): string {
  return cls === 'bad' ? `${userId}:bad` : `${userId}:${gameId}:${cls}`;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds the caller should wait before retrying (0 when allowed). */
  retryAfter: number;
}

// Production singleton for the in-memory layer.
const memory = new InMemoryFixedWindow();

/** Decide whether a request may proceed. Runs the in-memory pre-filter first
 *  (cheap, no I/O); if that allows it and a `dbHit` is provided, consults the
 *  authoritative DB limiter. `dbHit` MUST fail open itself OR throw — any
 *  throw is swallowed here and treated as allowed, so the limiter can never
 *  take gameplay down. */
export async function checkRateLimit(opts: {
  userId: string;
  gameId: string;
  actionClass: RateLimitClass;
  now?: number;
  dbHit?: (key: string, cfg: RateLimitConfig) => Promise<RateLimitResult | null>;
}): Promise<RateLimitResult> {
  const cfg = RATE_LIMITS[opts.actionClass];
  const key = rateLimitKey(opts.userId, opts.gameId, opts.actionClass);

  const mem = memory.hit(key, cfg, opts.now);
  if (!mem.allowed) return { allowed: false, retryAfter: mem.retryAfterSeconds };

  if (opts.dbHit) {
    try {
      const db = await opts.dbHit(key, cfg);
      if (db && !db.allowed) return { allowed: false, retryAfter: db.retryAfter };
    } catch {
      // Fail open — a limiter outage must not break the game.
    }
  }
  return { allowed: true, retryAfter: 0 };
}

/** Map a raw `action` string to its rate-limit class. Unknown/empty → 'bad'. */
export function classifyAction(action: string | null | undefined): RateLimitClass {
  switch (action) {
    case 'move':
    case 'endTurn':
    case 'revertAnt':
      return 'gameplay';
    case 'timeout':
    case 'resign':
    case 'rematch':
      return 'control';
    default:
      return 'bad';
  }
}
