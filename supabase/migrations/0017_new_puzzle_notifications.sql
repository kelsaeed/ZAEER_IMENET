-- ─── New-puzzle bell notifications ───────────────────────────────────────
-- Run AFTER 0008 (notifications table) and 0011 (daily_puzzles). Idempotent.
--
-- When the curator publishes a puzzle for today (status flips to
-- 'published' AND the puzzle_date is today or earlier), every player
-- should get a one-tap "today's puzzle is up — play now" entry in the
-- notification bell. Doing it via trigger means the database fans out
-- atomically the moment Publish is clicked, with no extra server route
-- to maintain.
--
-- The existing notifications schema is generic (`kind` is text,
-- `payload` is jsonb), so we just emit kind='new_puzzle' rows.
-- Dedupe rule: at most one unread 'new_puzzle' row per user per
-- puzzle_id, so re-publishing or status-flapping doesn't pile up
-- duplicate bell entries.

-- ─── 1) trigger function ─────────────────────────────────────────────────
create or replace function public.notify_new_daily_puzzle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  becoming_live boolean;
begin
  -- Fire only when this row is going from "not live for today" to
  -- "live for today". Catches both: (a) UPDATE that flips status to
  -- 'published' (the typical Publish click), and (b) INSERT that
  -- already lands as 'published' (admin tooling that creates + ships
  -- in one step). Skips no-op updates so a curator editing flavour
  -- text doesn't fan out a second wave.
  becoming_live :=
        new.status = 'published'
    and new.puzzle_date is not null
    and new.puzzle_date <= current_date
    and (
      tg_op = 'INSERT'
      or old.status      is distinct from new.status
      or old.puzzle_date is distinct from new.puzzle_date
    );

  if not becoming_live then
    return new;
  end if;

  -- Drop any prior unread 'new_puzzle' rows pointing at this same
  -- puzzle so re-publish doesn't double-ping. We key on the puzzle id
  -- in payload (game_id stays NULL — this notif isn't tied to a game).
  delete from public.notifications
   where kind = 'new_puzzle'
     and read_at is null
     and (payload ->> 'puzzle_id') = new.id::text;

  -- One row per profile. The bell will dedupe its display by id, and
  -- the per-user RLS policy on notifications keeps each row only
  -- visible to its own user.
  insert into public.notifications (user_id, kind, game_id, actor_id, payload)
  select
    p.id,
    'new_puzzle',
    null,
    null,
    jsonb_build_object(
      'puzzle_id',   new.id,
      'puzzle_date', new.puzzle_date,
      'title_en',    new.title_en,
      'title_ar',    new.title_ar,
      'difficulty',  new.difficulty
    )
  from public.profiles p;

  return new;
end;
$$;

-- ─── 2) trigger ──────────────────────────────────────────────────────────
drop trigger if exists daily_puzzles_notify_published on public.daily_puzzles;
create trigger daily_puzzles_notify_published
  after insert or update on public.daily_puzzles
  for each row execute function public.notify_new_daily_puzzle();
