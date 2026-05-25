# Timeout liveness — opponent flag claim

Closes a real correctness bug in online clocked games without weakening
server-authoritative validation or trusting any client clock value.

## Old hanging scenario

Only the **active** player's client reported timeout: the clock-tick effect ran
`if (isMyTurn)` and, when the active player's clock hit 0, POSTed
`{ action: 'timeout' }`. If that player **disconnected, froze, closed the tab,
or simply refused to send it**, nobody ended the game — the opponent could
never win on time, and a clocked match could hang forever.

## New behavior

A second, server-authoritative action **`claimTimeout`** lets the *waiting*
player end the game once the active player's clock has genuinely expired:

- The **active** player still self-reports `timeout` as before (with a small
  grace band, so their own flag is accepted even a beat early).
- The **waiting** player's client watches the opponent's clock and, once it's
  safely past zero, sends `claimTimeout`. The loser is **always** the active
  player (`state.currentPlayer`); the winner is the other side.
- The server decides validity from the **canonical stored clock** and **its
  own time** — the claimant's clock is never trusted, and the check is
  **strict** (no grace) so a claim with real time left is rejected.

## Files changed

| File | Change |
| --- | --- |
| `src/game/onlineActions.ts` | Extracted pure `evaluateClock(state, now)` (active player's remaining time + per-move state) and added pure `evaluateTimeoutClaim(state, now)` (strict expiry → `applyTimeout(active)` or a 400/409). Refactored the existing self-report `timeoutAction` to reuse `evaluateClock` (behavior unchanged, keeps its grace band). |
| `src/app/api/games/[gameId]/move/route.ts` | New `claimTimeout` branch: auth + participant (already enforced earlier in the handler), `evaluateTimeoutClaim` against `Date.now()`, persist via service role guarded on `status='playing'` AND `current_turn` (race guard) → 409 if a move landed first. |
| `src/lib/server/rateLimit.ts` | `claimTimeout` classified as a `control` action (5 / 30s per user+game). |
| `src/lib/supabase/games.ts` | `{ action: 'claimTimeout' }` added to `GameActionBody`. |
| `src/hooks/useOnlineGame.ts` | New waiting-player effect: polls the opponent's clock and fires one `claimTimeout` per opponent turn once it's ~2s past zero; on 409 it resyncs and re-arms; spectators never claim. |
| `src/game/onlineActions.test.ts` | +7 tests for `evaluateClock` / `evaluateTimeoutClaim`. |

No schema/migration change — everything needed (`clocks.startedAt`,
`p1Seconds`/`p2Seconds`, `perMoveSeconds`, `currentPlayer`) is already in the
persisted `games.state`.

## Clock calculation strategy

`evaluateClock(state, now)` reads the **active** player (`state.currentPlayer`)
and computes `remaining = clocks[activeKey] − (now − clocks.startedAt)`, plus
whether the per-move cap (`perMoveSeconds`) was blown. Two thresholds use it:

- **Self-report `timeout`:** accepted if `remaining ≤ TIMEOUT_GRACE_SECONDS`
  (3s) — generous to the flagging player against clock skew.
- **`claimTimeout`:** accepted only if `remaining ≤ 0` (or per-move blown) —
  **strict**, so an opponent can't steal a win with time left.

All arithmetic is server-side; the request body carries no clock data.

## Race / concurrency strategy

The claim's `UPDATE` is guarded on `status = 'playing'` **and**
`current_turn = <the turn we loaded>`:

- If the active player made a legal move in the same instant, `current_turn`
  has advanced → the claim updates **0 rows** → `409 'game has advanced'`. That
  is correct: a player who moved did **not** flag.
- `status = 'playing'` prevents double-ending an already-finished/abandoned
  game.
- So a last-second move and a timeout claim can never both win — exactly one
  write succeeds, mirroring the optimistic-concurrency guard the move path
  already uses. The ELO trigger (migration 0005) fires on the
  `status → finished` + `winner_id` write just like any other game end.

## Client behavior

- The waiting player's effect fires `claimTimeout` **at most once per opponent
  turn**, only after the opponent's clock is ~2s past zero (skew buffer). The
  active player's own self-report (at 0) normally ends the game first when
  they're online; the claim is the fallback for when they're gone.
- A `409` (opponent moved / already ended) → resync from the DB and re-arm; the
  UI never depends on the claim succeeding.
- `claimTimeout` is rate-limited as a `control` action, so a buggy/abusive
  client can't spam it.
- Realtime fans the canonical finished state to both browsers as usual.

## Tests

`src/game/onlineActions.test.ts` (pure, deterministic via injected `now`):

- `evaluateClock` reads the active player's remaining time; null when unclocked.
- claim **succeeds** once the active player's clock has expired (correct winner).
- claim **rejected before expiry** (`409`).
- claim **rejected just before zero** — proves the strict no-grace rule (a 2s
  remainder that the self-report grace *would* accept is refused for a claim).
- claim **honors the per-move cap**.
- claim on an **unclocked** game → `400`.
- claim on a **finished** game → `409`.

Participant (`403`) and the `current_turn` race guard live in the route/DB and
are covered by the manual smoke checks below.

## Manual browser smoke checklist

- [ ] Create a **clocked** online game (e.g. Blitz 1+0); join from a second
      browser/account.
- [ ] Make a normal move — clocks tick, turn passes.
- [ ] Leave the **active** player idle (or close their tab) until their clock
      hits 0.
- [ ] From the **opponent** browser, the game ends on time within a couple
      seconds (the claim fires automatically); **correct winner** shown.
- [ ] Both browsers update via Realtime.
- [ ] **Early claim is impossible:** with time clearly left, nothing ends (and
      a manually-forced claim returns 409 `clock has not expired`).
- [ ] **Last-second move wins the race:** if the active player moves right as
      their clock nears 0, the move lands and the claim 409s (no double-end).
- [ ] **Resign** still works. **Rematch** still works. **Ready toggle** works.
- [ ] An **untimed** or **async** game is unaffected (no clock → claim is a
      no-op / 400; the waiting-player effect never arms).

## Remaining clock limitations

- The waiting-player claim depends on the **opponent** having the tab open. If
  *both* players disconnect, the game stays open until one returns (then the
  returning player can claim if it's their opponent who flagged). A fully
  server-side sweeper (cron) could finish abandoned clocked games with no one
  watching — out of scope here.
- The ~2s claim buffer means a flag is enforced ~2s after true expiry in the
  disconnect case; the present active player's own self-report still ends it at
  0 when online, so normal play is unaffected.

## Validation

- `npm run typecheck` — **passes** (`tsc --noEmit`, strict).
- `npm test` — **passes, 110/110** (+7 timeout-claim tests).
- `npm run build` — **passes**.
- `npm run lint` — **not configured** (no `lint` script, no ESLint config).
