# Rate limiting / abuse protection

Throttles request spam against the server-authoritative gameplay endpoint
without touching any game rule or weakening server-authoritative validation.
A determined authed user could previously spam *legal* (or malformed)
requests and hammer the API, Supabase, and Realtime; this caps that.

## Protected endpoint

`POST /api/games/[gameId]/move` — the single endpoint that handles every
online gameplay action (`move`, `endTurn`, `revertAnt`, `timeout`, `resign`,
`rematch`). No other gameplay write path exists (joins go through SECURITY
DEFINER RPCs; the ready-toggle is a harmless column write — see
`SERVER_AUTHORITATIVE_MOVES_REPORT.md`), so this one endpoint is the whole
gameplay attack surface.

The limiter runs **after auth, before any DB load or engine work**, so a
throttled request is rejected as cheaply as possible.

## Limits

Keyed by **user + game + action-class** (never IP-only — many users share an
IP, and auth runs first so we always have a stable user id, a stronger
signal). Fixed window:

| Class | Actions | Limit | Reasoning |
| --- | --- | --- | --- |
| `gameplay` | move, endTurn, revertAnt | **30 / 10s** per user+game | A blitz/bullet turn is ~1–2 requests (an ant turn = move + End Turn). 30/10s ≈ 3 req/s — unreachable by a human, trivially tripped by a script. Generous on purpose so fast play and post-resync moves never break. |
| `control` | timeout, resign, rematch | **5 / 30s** per user+game | Each fires ~once per game; 5/30s tolerates rematch churn while blocking floods. |
| `bad` | malformed / unknown action | **10 / 10s** per user | Caught even though the request still 400s, so a fuzzing client can't spin the route. Per-user (game-agnostic) to catch cross-room spraying. |

`bad` requests are counted **and** still return their normal 400 — throttling
doesn't change existing status codes.

## Storage design (two layers, fail-open)

One entry point, `checkRateLimit` in `src/lib/server/rateLimit.ts`:

1. **In-memory fixed window** (`InMemoryFixedWindow` singleton). Per-lambda,
   so **best-effort** on Vercel — but a zero-latency pre-filter that blocks a
   client hammering one warm instance *without a DB round-trip*, which is what
   shields Supabase from a burst. The window math is the pure, unit-tested
   `evaluateFixedWindow`. The map self-sweeps expired entries (every 500 hits
   and on demand) so it can't grow unbounded.
2. **DB-backed fixed window** via the `rate_limit_hit` Postgres RPC (migration
   `0019_rate_limits.sql`). Authoritative across all instances. One atomic
   upsert per call; mirrors the same algorithm as the pure TS function.

If the in-memory layer allows a request, the route consults the DB layer.
**Both layers fail open**: any RPC error — including running this code before
migration 0019 is applied — is swallowed and the request is allowed. A
limiter outage must never take a live game down.

### Migration `0019_rate_limits.sql`

- Table `public.rate_limits(key text pk, window_start timestamptz, count int)`.
  RLS enabled, **no client grants** — only the SECURITY DEFINER function and
  the service role touch it.
- Function `rate_limit_hit(p_key, p_limit, p_window_seconds)` returns
  `(allowed boolean, retry_after int)`. Atomic `insert … on conflict do
  update` that resets the window in place when it has elapsed, else
  increments. Granted to `authenticated`.
- **Cleanup:** fixed-window rows are reused per key (bounded by distinct
  user×game×class), and ~1% of calls opportunistically `delete` rows whose
  window opened over an hour ago. No cron needed.

This migration must be applied in the Supabase SQL editor to enable the
durable cross-instance layer. Until then the in-memory layer still works
(best-effort) and the route fails open on the missing function.

## Failure behavior

Over a limit → **HTTP 429**:

```json
{ "ok": false, "error": "rate_limited", "retryAfter": <seconds> }
```

with a standard `Retry-After: <seconds>` header. No other data is leaked. All
existing **400 / 401 / 403 / 409** behavior is unchanged, and
server-authoritative validation (`applyOnlineAction`) is untouched. The
client's `submitGameAction` already treats any non-OK response as a rejected
action (logs + resyncs from the DB), so a stray 429 for a legitimate user
degrades gracefully — no client change was needed.

## Tests

`src/lib/server/rateLimit.test.ts` (run via `npm test`):

- `evaluateFixedWindow`: first hit allowed; allows up to the limit; rejects
  beyond with a correct `retryAfter`; opens a new window after elapse.
- `InMemoryFixedWindow`: under-limit allowed; over-limit blocked; distinct
  keys independent; window reset; sweep drops expired entries.
- `checkRateLimit`: under limit allowed; **different users** don't block each
  other; **different games** don't block each other; over the in-memory limit
  **short-circuits before the DB hop**; the **DB layer can block** when memory
  allows; a **throwing DB layer fails open**.
- `classifyAction` / `rateLimitKey` shape.

The DB RPC itself can't be unit-tested without Postgres — see manual smoke
below.

## Manual smoke (after applying 0019)

1. **Normal play unaffected:** play a full blitz/bullet match in two browsers
   — moves, ant move+rotate+End Turn, resign, rematch, timeout. Nothing should
   feel throttled.
2. **Gameplay spam → 429:** from a signed-in console, fire the move endpoint
   in a tight loop and confirm 429s with `retryAfter` after ~30 in 10s:
   ```js
   for (let i = 0; i < 50; i++)
     fetch(`/api/games/${GAME_ID}/move`, { method:'POST',
       headers:{'Content-Type':'application/json'},
       body: JSON.stringify({ action:'revertAnt', expectedTurn: 0 }) })
       .then(r => console.log(r.status));
   ```
3. **DB layer verify:**
   ```sql
   select key, count, window_start from public.rate_limits order by window_start desc limit 10;
   -- and confirm the function exists / is definer:
   select proname, prosecdef from pg_proc where proname = 'rate_limit_hit';
   ```
4. **Two accounts don't interfere:** spam from account A; account B in the
   same room still plays normally.

## Remaining abuse gaps (out of scope here)

- **Per-instance in-memory layer is best-effort.** The DB layer is the
  authoritative one; the in-memory layer just reduces DB load from bursts.
- **No global/account-creation rate limit.** A botnet of many accounts each
  staying under the per-user limit isn't stopped by this (would need WAF /
  network-edge limiting — Vercel/Cloudflare).
- **Fail-open by design.** If Supabase is down, limiting is effectively off
  (gameplay is prioritized over throttling).
- **Connection/Realtime subscription spam** is not addressed here — this
  covers the action endpoint only.
- **Timeout liveness** (opponent claiming a win on disconnect) is a separate
  tracked item, intentionally not touched.
