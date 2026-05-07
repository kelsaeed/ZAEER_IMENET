# Daily Puzzles — end-to-end smoke test

Run this top to bottom whenever Daily Puzzles code changes. Every step has
an expected outcome; stop and investigate at the first deviation.

You'll need: a Supabase project with the schema applied, the dev server
running locally (`npm run dev`), and two browser profiles (one signed in
as an admin, one as a regular user). The admin profile is created via
`npm run seed:admin` per `SETUP.md`.

---

## 1. Migrations are applied

In the Supabase SQL editor, run in order if you haven't already:

| Migration | Purpose |
|---|---|
| `0001_init.sql` … `0010_notify_live_too.sql` | Base schema (already required for the rest of the app). |
| `0011_daily_puzzles.sql` | Adds `daily_puzzles`, `daily_puzzle_solutions`, `puzzle_attempts`, profile streak fields, RLS, streak trigger. |
| `0012_daily_puzzles_safety.sql` | Adds the auto-invalidate / cleanup-on-edit / friendly-publish-guard triggers. |

Verify in the SQL editor:

```sql
select tablename from pg_tables
where schemaname = 'public'
  and tablename in ('daily_puzzles', 'daily_puzzle_solutions', 'puzzle_attempts');
```

Expect three rows. Also confirm the new triggers exist:

```sql
select tgname from pg_trigger
where tgname in ('daily_puzzles_invalidate', 'daily_puzzles_cleanup_solution',
                 'daily_puzzles_assert_publishable', 'puzzle_attempts_streak');
```

Expect four rows.

---

## 2. Typecheck + validator unit tests

```
npm run typecheck
npm run test:puzzles
```

Typecheck must exit 0. The puzzle test suite expects
`tests 6 / pass 6 / fail 0`. The cases cover: legal forced kill,
illegal attacker move, defender escape, stalemate-with-lion-alive,
engine-version mismatch, empty-line.

---

## 3. Author + validate a puzzle (admin profile)

1. Sign in as the admin user (the one `seed:admin` made).
2. Visit `/admin/puzzles/new`.
3. Paste this minimal mate-in-1 into **Position (JSON)** — Player 1 to
   move, with the attacker lion adjacent to the defender lion:

   ```json
   {
     "v": 1,
     "sideToMove": 1,
     "pieces": [
       { "id": "p1_lion", "type": "lion", "player": 1, "row": 5, "col": 5 },
       { "id": "p2_lion", "type": "lion", "player": 2, "row": 4, "col": 5 }
     ]
   }
   ```

4. Paste this **Solution (JSON)** — one move that kills the enemy lion:

   ```json
   [{ "pieceId": "p1_lion", "target": { "row": 4, "col": 5 } }]
   ```

5. Set Difficulty `1`, Theme `smoke test`, Title (EN) `Smoke test mate-in-1`.
6. Click **Validate & save**.

   Expect a green confirmation banner: `Validated. Puzzle saved as <uuid> at <iso>.`

7. The page navigates to the edit URL. Verify in the SQL editor that the
   solution was stored:

   ```sql
   select puzzle_id, jsonb_typeof(solution_tree), engine_version
     from public.daily_puzzle_solutions
    order by created_at desc limit 1;
   ```

   Expect one row, `solution_tree = 'object'`, `engine_version = '1.0.0'`
   (or whatever `ENGINE_VERSION` currently is).

---

## 4. Verify the safety trigger

Still on the puzzle's edit page from step 3:

1. In the SQL editor, observe the row's `validated_at` is non-null and
   `engine_version = '1.0.0'`.
2. Update the position via SQL (simulating an admin edit that bypasses
   the validate API):

   ```sql
   update public.daily_puzzles
      set position = jsonb_set(position, '{sideToMove}', '2'::jsonb)
    where id = '<puzzle id from step 3>';
   ```

3. Re-query:

   ```sql
   select status, validated_at, engine_version
     from public.daily_puzzles where id = '<puzzle id>';
   select count(*) from public.daily_puzzle_solutions where puzzle_id = '<puzzle id>';
   ```

   Expect: `status = 'draft'` (auto-demoted from whatever it was),
   `validated_at = null`, `engine_version = null`, solutions count = 0.

4. Try to publish a stale row directly:

   ```sql
   update public.daily_puzzles
      set status = 'published'
    where id = '<puzzle id>';
   ```

   Expect a clear error mentioning the puzzle isn't validated yet.

5. Restore by re-validating: in the admin UI re-paste the original
   position + solution and click **Validate & save** again.

---

## 5. Publish for today

Back on the puzzle's edit page:

1. Set **Puzzle date** to today's date.
2. Click **Move to queued** (optional intermediate state).
3. Click **Publish**.

   Expect the page to reload with `Status: published`.

4. Confirm:

   ```sql
   select status, puzzle_date, validated_at is not null as validated
     from public.daily_puzzles
    where puzzle_date = current_date;
   ```

   Expect one row, `status = 'published'`, `validated = true`.

---

## 6. Solve the puzzle (player profile)

1. In a fresh browser profile, sign in as a regular (non-admin) user.
   If they have no streak yet, fine.
2. Visit `/`. The Daily Puzzle button is the third hero CTA.
3. Click it. Expect the puzzle board to render with the position from
   step 3, "Player 1 to move — kill the lion" in the side panel,
   difficulty stars, the puzzle date, and a "Wrong moves: 0" chip.
4. Click `p1_lion` (cell row 5, col 5 — chess label `F11`). Expect the
   adjacent valid move squares to highlight.
5. Click `(4, 5)` (chess label `F12` — directly above). Expect:
   - Network tab shows `POST /api/puzzles/<id>/move` returning
     `{ result: 'solved', principalLine: [...] }`.
   - The board flips into the **PuzzleReplayer** at step `1/1`,
     auto-playing.
   - The side panel shows the `🏆 You got it!` solved card AND a text
     reveal listing the principal line below.
6. Confirm the streak incremented:

   ```sql
   select puzzle_current_streak, puzzle_best_streak, puzzle_last_solved_date
     from public.profiles where id = '<player uuid>';
   ```

   Expect `puzzle_current_streak >= 1`, `puzzle_best_streak >= 1`,
   `puzzle_last_solved_date = current_date`.

---

## 7. Wrong move + give-up flow (second player profile or reset attempt)

If you only have one player profile, reset the attempt first:

```sql
delete from public.puzzle_attempts
 where user_id = '<player uuid>' and puzzle_id = '<puzzle uuid>';
```

(This resets both the attempt and the streak counters won't change
because the trigger only fires on `solved_at` set — not on delete.)

1. Visit `/puzzle` again. Expect the live board (not the replayer)
   with `Wrong moves: 0`.
2. Click `p1_lion`, then click any non-adjacent legal cell (e.g. row 6,
   col 5 — moving away from the enemy lion). Expect:
   - The board momentarily updates (optimistic), then reverts to the
     starting position.
   - "Not quite — try again" toast above the board.
   - The wrong-moves chip increments to 1.
3. Click `I give up`. Confirm in the dialog. Expect:
   - The board flips into the **PuzzleReplayer** showing the principal
     line auto-playing.
   - The text-list reveal appears in the side panel.
   - In the DB, `puzzle_attempts.gave_up_at` is set, `solved_at` is null.

---

## 8. Engine-drift hides the puzzle

1. Bump `ENGINE_VERSION` in `src/game/engineVersion.ts` (e.g. `'1.0.0'` →
   `'1.0.1'`).
2. Restart the dev server.
3. Visit `/puzzle` as the player. Expect: `This puzzle is being checked.
   Try again in a moment.` (HTTP 503 from `/api/puzzles/today`).
4. Revert `ENGINE_VERSION`. Restart. The puzzle works again.

This proves the version-stamp gate hides puzzles whose proofs were
generated against a different engine.

---

## 9. Done

Tear down the smoke-test puzzle so it doesn't show up tomorrow:

```sql
delete from public.daily_puzzles where theme = 'smoke test';
```

(The `daily_puzzle_solutions` row is removed via FK cascade.)
