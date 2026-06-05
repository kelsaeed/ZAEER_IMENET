-- ─── Puzzle archive: protect the daily streak ────────────────────────────
-- Run AFTER 0001..0020. Idempotent (replaces a function in place).
--
-- Why this exists
-- ---------------
-- The puzzle archive lets a player solve PAST puzzles, not just today's.
-- Nothing in the move/start/give-up routes is date-locked — they key off
-- the puzzle id and RLS already allows reading any published puzzle dated
-- on or before today. So the archive is almost entirely additive… except
-- for the streak trigger.
--
-- update_streak_on_solve (migration 0011) buckets the streak by the solved
-- puzzle's `puzzle_date`. Its original "else → reset to 1" branch fires for
-- ANY date that isn't exactly the day after the last solved one. That was
-- fine when the only solvable puzzle was today's, but with the archive a
-- player who is up to date on the daily and then goes back to practice an
-- OLDER puzzle would have `pdate < puzzle_last_solved_date`, hit the reset
-- branch, and lose their hard-earned streak. Practicing the archive must
-- never punish the daily streak.
--
-- The fix: solving a puzzle whose date is OLDER than the last counted date
-- is a no-op for the streak. The forward cases are unchanged:
--   • pdate = prev + 1          → advance (consecutive day)
--   • pdate = prev              → already counted, no-op
--   • pdate < prev              → archive practice, no-op   (NEW)
--   • pdate > prev + 1          → genuine gap, reset to 1
--   • prev is null              → first ever solve, streak = 1
--
-- When a player is fully caught up (prev = today) every archive puzzle has
-- pdate < prev, so the streak is completely insulated — exactly what we want.

create or replace function public.update_streak_on_solve()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  pdate       date;
  prev        date;
  newstreak   int;
begin
  if new.solved_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.solved_at is not null then return new; end if;

  select puzzle_date into pdate from public.daily_puzzles where id = new.puzzle_id;
  if pdate is null then return new; end if;

  select puzzle_last_solved_date into prev from public.profiles where id = new.user_id;

  if prev is null then
    newstreak := 1;
  elsif pdate <= prev then
    -- Same date already counted, OR an older (archive) puzzle. Either way
    -- the daily streak must not move. This is the line the archive needs.
    return new;
  elsif pdate = prev + 1 then
    select puzzle_current_streak + 1 into newstreak
      from public.profiles where id = new.user_id;
  else
    -- Gap of at least one day → reset to 1.
    newstreak := 1;
  end if;

  update public.profiles
     set puzzle_current_streak    = newstreak,
         puzzle_best_streak       = greatest(puzzle_best_streak, newstreak),
         puzzle_last_solved_date  = pdate
   where id = new.user_id;

  return new;
end;
$$;
