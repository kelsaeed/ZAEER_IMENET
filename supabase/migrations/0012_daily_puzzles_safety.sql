-- ─── Daily puzzles — safety hardening ───────────────────────────────────
-- Run AFTER 0011. Idempotent.
--
-- Closes the "stale-proof loophole": before this migration, an admin who
-- edited a published puzzle's position via the Supabase client (bypassing
-- the validate API) could leave validated_at and engine_version stamped
-- against the old proof — the player API would happily serve a position
-- that no longer matched its solution tree.
--
-- Mitigation, in order:
--
-- 1. BEFORE UPDATE on daily_puzzles: if any of the proof-bearing fields
--    change (position, side_to_move, position_version,
--    allow_multiple_solutions), null validated_at + engine_version, AND
--    auto-demote status from 'published' back to 'draft'. The auto-demote
--    is what keeps the row legal under daily_puzzles_published_complete
--    after invalidation — without it, the constraint would simply reject
--    the edit, which is correct but produces a confusing error.
--
-- 2. AFTER UPDATE on daily_puzzles: when validated_at transitions
--    non-null → null, delete the matching daily_puzzle_solutions row
--    so the player API can never accidentally read a tree that no
--    longer matches its puzzle. The cascade FK already removes the
--    solution if the puzzle is deleted; this trigger covers the
--    "edited in place" case the cascade misses.

-- ─── 1) BEFORE UPDATE: invalidate proof on field change ──────────────────
create or replace function public.invalidate_puzzle_on_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op <> 'UPDATE' then return new; end if;

  if (
    new.position                 is distinct from old.position
    or new.side_to_move          is distinct from old.side_to_move
    or new.position_version      is distinct from old.position_version
    or new.allow_multiple_solutions is distinct from old.allow_multiple_solutions
  ) then
    new.validated_at   := null;
    new.engine_version := null;
    -- Demote published → draft so the row remains legal under the
    -- published-completeness check. Queued/retired stay where they
    -- are; the curator can re-validate then re-publish.
    if new.status = 'published' then
      new.status := 'draft';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists daily_puzzles_invalidate on public.daily_puzzles;
create trigger daily_puzzles_invalidate
  before update on public.daily_puzzles
  for each row execute function public.invalidate_puzzle_on_change();

-- ─── 2) AFTER UPDATE: clean up the solution row when invalidated ─────────
-- security definer because the cleanup must run regardless of which
-- admin RLS policy the caller satisfies; without it a future RLS
-- tightening on daily_puzzle_solutions could leave orphan trees behind.
create or replace function public.cleanup_solution_on_invalidate()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then return new; end if;
  if old.validated_at is not null and new.validated_at is null then
    delete from public.daily_puzzle_solutions where puzzle_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists daily_puzzles_cleanup_solution on public.daily_puzzles;
create trigger daily_puzzles_cleanup_solution
  after update on public.daily_puzzles
  for each row execute function public.cleanup_solution_on_invalidate();

-- ─── 3) Friendlier publish guard ─────────────────────────────────────────
-- The check constraint daily_puzzles_published_complete already blocks
-- transitions to 'published' without validated_at + engine_version, but
-- the constraint error message is opaque ("violates check constraint").
-- This BEFORE trigger raises a clearer message that the admin UI can
-- surface as-is. Keeping the constraint as the actual safety net — the
-- trigger is just better DX.
create or replace function public.assert_publishable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.status = 'published' and old.status <> 'published' then
    if new.validated_at is null then
      raise exception 'Cannot publish puzzle %: not validated yet. Run "Validate & save" first.', new.id
        using errcode = 'check_violation';
    end if;
    if new.engine_version is null then
      raise exception 'Cannot publish puzzle %: missing engine_version stamp.', new.id
        using errcode = 'check_violation';
    end if;
    if new.puzzle_date is null then
      raise exception 'Cannot publish puzzle %: set a puzzle_date first.', new.id
        using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'INSERT' and new.status = 'published' then
    if new.validated_at is null or new.engine_version is null or new.puzzle_date is null then
      raise exception 'Cannot insert puzzle as published without validated_at, engine_version, and puzzle_date.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists daily_puzzles_assert_publishable on public.daily_puzzles;
create trigger daily_puzzles_assert_publishable
  before insert or update on public.daily_puzzles
  for each row execute function public.assert_publishable();
