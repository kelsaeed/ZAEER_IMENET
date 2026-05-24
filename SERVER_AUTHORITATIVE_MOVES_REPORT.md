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
- **Timeout is self-reported by the player on the clock.** Only the *active*
  player's client fires the `timeout` intent (and the server confirms their
  clock truly expired). If that player closes/freezes their browser, nobody
  submits the flag-fall and the game hangs until they return — the opponent
  cannot force a timeout win. This is a liveness gap, not a security hole
  (no one can claim a win they didn't earn), and it predates this change.

## Audit findings (post-implementation)

A full audit of the trust boundary was performed after the change shipped.
Result: **no unsafe client write path remains** and **no code changes were
required for correctness/security.** Detail:

- **Only one direct client write to `games` survives** —
  `useOnlineGame.toggleReady` writes `{ p1_ready | p2_ready }`, exactly the
  columns 0018 re-grants. Every other gameplay write goes through the route
  (service role). Verified by grepping `.from('games').update`, `saveGameState`,
  and the sensitive column names — the only hits are the route (service role)
  and the ready toggle.
- **`current_turn` is a sound optimistic-concurrency token.** `applyMove`
  advances `state.turn` on *every* persisted transition — including an ant's
  positional move (it does not flip the player but it does bump `turn`). So
  back-to-back writes always change `current_turn`, and a stale/duplicated
  request fails the `.eq('current_turn', expectedTurn)` guard → `409`. The
  only window where `current_turn` is stable is between an ant's move and its
  `revertAnt` (revert keeps `turn`); within that window the engine's
  `antMovedThisTurn` / `antAttackedThisTurn` flags reject any illegal
  duplicate, so no double-apply is possible.
- **Migration is non-destructive to every other flow.** Game creation is an
  `INSERT` (untouched by the UPDATE revoke); joining and invite lookup run
  through the `SECURITY DEFINER` RPCs `join_open_game` / `find_game_by_invite_code`
  (0004), which run as the table owner and bypass the column grant; the ELO
  (0005) and `awaiting_player_id`/`last_move_at` (0008) triggers fire on the
  service-role write; the `games_touch` trigger setting `updated_at` needs no
  caller column privilege (BEFORE-trigger NEW writes are exempt). The 0001
  row-level UPDATE policy still applies on top of the column grant, so the
  ready toggle still requires participation.
- The new unit tests (`onlineActions.test.ts`) cover the engine boundary:
  legal/illegal move, out-of-turn, opponent's piece, unknown piece, finished
  game, timeout-before-expiry, the ant move→end-turn→revert sequence, the
  mid-ant-turn move lock, and illegal/non-ant rotation. Participant and
  optimistic-concurrency rejection live in the route/DB layer and are covered
  by the manual SQL + smoke checks below (they can't be unit-tested without
  mocking Supabase).

## Post-deploy verification in Supabase (after applying 0018)

Run these in the Supabase SQL editor once the migration is applied. Each has
the expected result inline.

```sql
-- 1) authenticated must have NO table-wide UPDATE, only the two ready columns.
--    Expect exactly two rows: p1_ready and p2_ready.
select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'games'
  and grantee = 'authenticated' and privilege_type = 'UPDATE'
order by column_name;

-- 2) Confirm there is no remaining *table-level* UPDATE grant for anon/auth.
--    Expect 0 rows.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'games'
  and grantee in ('anon', 'authenticated') and privilege_type = 'UPDATE';

-- 3) RLS policies still present (read participants/public, insert as p1,
--    update participants). Expect the four games_* policies to be listed.
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'games'
order by policyname;

-- 4) The join/lookup helpers must still be SECURITY DEFINER (prosecdef = t),
--    or joining a room breaks under the lockdown. Expect both rows true.
select proname, prosecdef
from pg_proc
where proname in ('join_open_game', 'find_game_by_invite_code');

-- 5) service_role keeps full UPDATE (the route relies on it). Expect a row.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'games'
  and grantee = 'service_role' and privilege_type = 'UPDATE';
```

Then prove the lockdown end-to-end from a signed-in player's devtools console:

```js
// Should fail with "permission denied for column \"state\"" after 0018:
await sb.from('games').update({ state: {}, status: 'finished', winner_id: MY_ID })
        .eq('id', GAME_ID);
// Should succeed (allowed column):
await sb.from('games').update({ p1_ready: true }).eq('id', GAME_ID);
```

## Browser smoke checklist

Two browsers / two accounts, after 0018 is applied:

- [ ] **Create public room** — host sees "waiting for opponent".
- [ ] **Join from the second account** — both flip to the live board; host's
      waiting screen clears (Realtime, with the 3 s polling safety net).
- [ ] **Normal legal move** — lands on both boards within ~0.5 s.
- [ ] **Illegal move rejection** — a refused intent snaps the board back
      (client resync on `400`/`403`/`409`); no drift.
- [ ] **Ant move + rotation + End Turn** — move the ant one step, rotate it,
      End Turn; the committed orientation shows on the opponent's board.
- [ ] **Revert an un-attacked ant move** — move the ant, click empty space; it
      snaps back on *both* boards and you can move again.
- [ ] **Timeout** — on a clocked match, let the active player's clock hit 0;
      the opponent gets the win via Realtime. (Confirm it can't be claimed
      with time left — the server rejects it `409`.)
- [ ] **Resign** — winner/abandoned status shows on both sides.
- [ ] **Rematch** — both click Ready; the board resets, series score
      increments for the previous winner, and a double-click race is a no-op.
- [ ] **Ready toggle still works** — toggling Ready on/off persists (this is
      the one allowed direct client write).
- [ ] **Realtime sync** — moves, resign, timeout, and rematch all fan to the
      other browser without a manual refresh.

## Validation commands

- `npm run typecheck` — **passes** (`tsc --noEmit`, strict).
- `npm test` (`tsx --test src/game/*.test.ts`) — **passes**, 23/23
  (17 in `onlineActions.test.ts` + 6 in the existing puzzle-validator suite).
  Note: `tsx` resolves via `npm`/`npx`; calling the bare `tsx` binary on a
  shell without `node_modules/.bin` on PATH won't find it.
- `npm run build` — **passes** (`next build`; `/api/games/[gameId]/move`
  compiles as a dynamic route).
- `npm run lint` — **not configured.** There is no `lint` script in
  `package.json` and no ESLint config in the repo; `next lint` would prompt
  for first-time setup. Nothing to run.
