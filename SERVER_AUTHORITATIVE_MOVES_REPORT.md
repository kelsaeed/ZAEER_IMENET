# Server-authoritative online moves

This change removes the client's ability to write trusted online game state.
Online moves are now validated and computed on the server with the existing
pure engine; clients submit only an *intent*.

## Files changed

| File | Change |
| --- | --- |
| `src/game/onlineActions.ts` | **New.** Pure, React/Supabase-free validator+applier. Turns a move intent into the next `GameState` by re-running the existing engine (`applyMove`/`applyEndTurn`/`applyTimeout`/`getValidMoves`). Unit-testable in isolation. |
| `src/app/api/games/[gameId]/move/route.ts` | **New.** Node API route. Authenticates the user, loads the canonical row, resolves the caller's side, defers rule decisions to `applyOnlineAction`, and persists only the server-computed result via the **service role**. Also handles `resign` and `rematch` (which need row context). |
| `supabase/migrations/0018_server_authoritative_moves.sql` | **New.** Revokes the blanket client `UPDATE` on `games` and re-grants only `(p1_ready, p2_ready)`. Closes the devtools bypass at the database level. |
| `src/lib/supabase/games.ts` | Removed client-trusted `saveGameState` and dead `resignGame`; added `submitGameAction()` (POSTs an intent to the route) + `GameActionBody`/`GameActionResult` types. |
| `src/hooks/useOnlineGame.ts` | Move/endTurn/revert/timeout/resign/rematch now submit intents via the endpoint (with optimistic local render + resync-on-reject). Selection and in-progress ant rotation stay local. Ready-flag toggle stays a direct client write (allowed column). |
| `src/game/onlineActions.test.ts` | **New.** Unit tests for the trust boundary. |
| `package.json` | Added `npm test` (runs `src/game/*.test.ts`). |

## Old (insecure) flow

1. Client computes the new `GameState` locally (`applyMove`/`applyEndTurn`).
2. Client writes the **full state** + `status`/`winner_id` to `games` via the
   browser anon client (`saveGameState`).
3. RLS (`0001`) only checks **participation**, not move legality — so any
   participant could PUT an arbitrary winning board and gain ELO. Resign,
   timeout, and the rematch reset were direct client writes too.

## New (secure) flow

1. Client renders the move optimistically (snappy UX) and POSTs **only the
   intent** to `POST /api/games/[gameId]/move`.
2. The route: authenticates via the session cookie → loads the canonical row
   (RLS read) → resolves the caller's player side from `player1_id/player2_id`
   → calls `applyOnlineAction(state, intent, myPlayer)`.
3. `applyOnlineAction` re-runs the **same engine** to validate (piece is
   yours, it's your turn, the target is in `getValidMoves`, the game is live)
   and compute the next state.
4. The route persists only the server-computed state via the **service role**
   (bypasses the column lockdown), with an optimistic-concurrency guard.
5. Realtime fans the canonical state to both players; the submitter also
   adopts it from the response. A rejected intent triggers a client resync.

The DB triggers (ELO `0005`, your-turn notifications `0008`/`0010`,
`awaiting_player_id`/`last_move_at` `0008`) fire on the service-role write
exactly as before — no trigger changes were needed.

## Endpoint contract

`POST /api/games/[gameId]/move` — body discriminated on `action`:

```jsonc
{ "action": "move",      "pieceId": "lion_p1_1", "to": { "row": 14, "col": 1 }, "rotateTo": "vertical?", "expectedTurn": 0 }
{ "action": "endTurn",   "pieceId": "ant_p1_1",  "rotateTo": "diagonal?", "expectedTurn": 3 }
{ "action": "revertAnt", "expectedTurn": 3 }
{ "action": "timeout",   "expectedTurn": 5 }
{ "action": "resign" }
{ "action": "rematch",   "expectedMatchNumber": 1 }
```

Responses:

- `200 { ok: true, state }` — applied; `state` is the canonical next state.
- `400 { ok:false, error }` — illegal move/rotation, bad payload, unknown piece.
- `401` — not signed in. `403` — not a participant / not your turn / not your piece.
- `404` — game not found (or not visible to you).
- `409` — game not in progress, clock hadn't expired, or **stale/raced** write.

`rotateTo` is only meaningful for ants: send it when the ant was rotated this
turn (the rotation is local-only until commit). The server validates it
against `getValidMoves(...).validRotations`.

## Concurrency strategy

Optimistic concurrency reuses the existing **`current_turn`** column (no new
field needed):

- Gameplay writes are conditioned on `.eq('status','playing')` **and**
  `.eq('current_turn', expectedTurn)`. If the game already advanced (or
  finished), 0 rows update → `409`, and the client resyncs.
- `rematch` is guarded on `.eq('match_number', expectedMatchNumber)` so if
  both clients fire the reset, only the first wins; the second is a no-op.
- `resign`/`timeout` are guarded on `status='playing'`, so they can't reopen
  a finished game.

`current_turn` mirrors `state.turn`, which `applyMove`/`applyEndTurn` advance
on every persisted transition, making it a serviceable move number.

## Database lockdown (migration 0018)

```sql
revoke update on public.games from anon;
revoke update on public.games from authenticated;
grant  update (p1_ready, p2_ready) on public.games to authenticated;
```

After this, a client UPDATE touching `state`/`status`/`winner_id`/etc. fails
with "permission denied for column". The service role (route) and the
`SECURITY DEFINER` join functions (`0004`) are unaffected. **This migration
must be applied** in the Supabase SQL editor for the lockdown to take effect;
until then the new client path is already in use, but the raw bypass is still
technically open.

## Remaining risks / notes

- **Engine trust:** server integrity equals engine correctness. The engine is
  unchanged and already unit-tested (puzzles + these new tests); a true bug in
  `getValidMoves`/`applyMove` would now be authoritative.
- **Ready flags** are still client-writable (intentionally harmless). The
  worst a client can do is toggle its own ready flag; it cannot alter the
  board or result, and the actual reset is server-side.
- **No rate limiting** on the endpoint yet (out of scope) — a determined
  authed user could spam *legal* requests. Tracked separately.
- **Service role key** must be present in the deployment env
  (`SUPABASE_SERVICE_ROLE_KEY`), already required by the puzzle move route.

## How to test manually

Prereq: apply migration `0018` to your Supabase project.

1. **Happy path:** start an online match in two browsers; play moves, ant
   move+rotate+End-Turn, revert an un-attacked ant move, resign, rematch,
   and a clock timeout. All should behave exactly as before, syncing via
   Realtime.
2. **Cheat attempt (the fix):** in player A's devtools console, try the old
   path directly:
   ```js
   const { getSupabaseBrowser } = await import('/_next/.../client.js'); // or use the app's client
   await sb.from('games').update({ winner_id: MY_ID, status:'finished',
       state: { /* any board */ } }).eq('id', GAME_ID);
   ```
   → should fail with **permission denied for column** (after 0018). Without
   0018 it would succeed — that's the hole this closes.
3. **Illegal intent:** POST `/api/games/<id>/move` with an out-of-range `to`
   → `400`. With someone else's `pieceId` or when it's not your turn → `403`.
4. **Stale write:** POST a `move` with an `expectedTurn` behind the current
   `current_turn` → `409`.
5. **Finished game:** POST any gameplay action to a finished game → `409`.

## Validation commands

- `npm run typecheck` — **passes** (`tsc --noEmit`, strict).
- `npm test` — **passes** (8/8 in `onlineActions.test.ts`; runs all
  `src/game/*.test.ts`).
- `npm run lint` — **not configured** (no ESLint setup in this repo; `next
  lint` prompts for first-time config).
- `npm run build` — see the run log accompanying this change.
