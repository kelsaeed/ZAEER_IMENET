-- ─── Daily puzzles ───────────────────────────────────────────────────────
-- Run AFTER 0001..0010. Idempotent.
--
-- One curated "X to move, kill the lion in N" position per day. Strong
-- players get a daily reason to come back even when no one's online. The
-- solution is held in a sibling table so it can be locked down with a
-- simple admin-only RLS policy — players never read it directly. The
-- per-move check happens in a server route handler that pulls the
-- solution_tree with the service role and walks it.
--
-- v1 ships single-solution puzzles only: every attacker decision node
-- has exactly one move the curator chose. The schema carries
-- `allow_multiple_solutions` so we can lift this later without another
-- ALTER, but a check constraint pins it to false for now.

-- ─── 1) daily_puzzles ────────────────────────────────────────────────────
do $$ begin
  create type public.puzzle_status as enum ('draft', 'queued', 'published', 'retired');
exception when duplicate_object then null; end $$;

create table if not exists public.daily_puzzles (
  id                        uuid primary key default gen_random_uuid(),
  -- Calendar day this puzzle is shown. Null while still a draft so the
  -- curator can build the position before committing to a slot.
  puzzle_date               date,
  -- Serialized PuzzleSnapshotV1 = { v, sideToMove, pieces[] }. Keeping the
  -- snapshot version distinct from the engine version (below) lets us
  -- evolve the on-disk shape without invalidating proven puzzles.
  position                  jsonb not null,
  position_version          int not null default 1,
  side_to_move              smallint not null check (side_to_move in (1, 2)),
  difficulty                smallint not null default 3 check (difficulty between 1 and 5),
  -- Free-form curator tag, e.g. 'ant fork', 'bat paralysis trap'.
  theme                     text,
  -- One-liner shown after the player solves. EN + AR per the simple-English
  -- copy convention used elsewhere in the project.
  title_en                  text,
  title_ar                  text,
  flavour_en                text,
  flavour_ar                text,
  status                    public.puzzle_status not null default 'draft',
  allow_multiple_solutions  boolean not null default false,
  author_id                 uuid references public.profiles(id) on delete set null,
  -- When the engine last successfully proved the solution forces a kill.
  -- Reset to null any time the puzzle's position or claimed solution
  -- changes — the player API should refuse to serve un-validated rows.
  validated_at              timestamptz,
  -- Stamp of the engine that produced the proof. The player API compares
  -- this against the live engine constant on every request; a mismatch
  -- means the proof is potentially stale and the puzzle is hidden until
  -- the re-validator script reproves it.
  engine_version            text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- v1 lock. Drop this constraint when the multi-solution authoring flow
  -- ships and the validator can prove all roots in lockstep.
  constraint daily_puzzles_v1_single_solution
    check (allow_multiple_solutions = false),

  -- Published rows are the only ones a player can ever read; insist they
  -- carry everything the runtime needs to serve them safely.
  constraint daily_puzzles_published_complete
    check (
      status <> 'published'
      or (
        puzzle_date is not null
        and validated_at is not null
        and engine_version is not null
      )
    )
);

-- One published puzzle per calendar day. Drafts and queued rows can sit
-- without a date or share a date during authoring.
create unique index if not exists daily_puzzles_published_date_uq
  on public.daily_puzzles(puzzle_date)
  where status = 'published';

create index if not exists daily_puzzles_status_date_idx
  on public.daily_puzzles(status, puzzle_date);

-- ─── 2) daily_puzzle_solutions ───────────────────────────────────────────
-- Sibling table holding the proof artefact. RLS is admin-only so the
-- anon/authenticated client never sees a column from here. The route
-- handler pulls it with the service role.
create table if not exists public.daily_puzzle_solutions (
  puzzle_id        uuid primary key references public.daily_puzzles(id) on delete cascade,
  -- Recursive { type: 'attacker' | 'kill', move, defenderBranches[] }.
  -- Built by the validator; mirrors what the player API walks per move.
  solution_tree    jsonb not null,
  -- Flat principal variation [m1_attacker, m1_defender, m2_attacker, ...]
  -- used by the give-up reveal to animate "the move was…".
  principal_line   jsonb not null,
  engine_version   text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ─── 3) puzzle_attempts ──────────────────────────────────────────────────
create table if not exists public.puzzle_attempts (
  id                        bigserial primary key,
  user_id                   uuid not null references public.profiles(id) on delete cascade,
  puzzle_id                 uuid not null references public.daily_puzzles(id) on delete cascade,
  started_at                timestamptz not null default now(),
  solved_at                 timestamptz,
  gave_up_at                timestamptz,
  wrong_moves               int not null default 0,
  time_seconds              int,
  -- Audit trail: every move the player has submitted, in order. The
  -- player API replays this prefix on each request to find the current
  -- node in the solution tree (stateless cursor).
  submitted_moves           jsonb not null default '[]'::jsonb,
  -- Engine version observed when the attempt started. If a re-validation
  -- bumps the puzzle's engine_version mid-attempt, the API can detect it
  -- and reject further submissions on this attempt rather than silently
  -- judging against a different tree.
  validated_engine_version  text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  unique (user_id, puzzle_id),
  -- An attempt is solved XOR given-up; never both.
  constraint puzzle_attempts_finished_xor
    check (solved_at is null or gave_up_at is null)
);

create index if not exists puzzle_attempts_user_idx
  on public.puzzle_attempts(user_id, solved_at desc nulls last);
create index if not exists puzzle_attempts_puzzle_idx
  on public.puzzle_attempts(puzzle_id);

-- ─── 4) profiles streak fields ───────────────────────────────────────────
alter table public.profiles
  add column if not exists puzzle_current_streak  int not null default 0;
alter table public.profiles
  add column if not exists puzzle_best_streak     int not null default 0;
alter table public.profiles
  add column if not exists puzzle_last_solved_date date;

-- ─── 5) Touch triggers ───────────────────────────────────────────────────
drop trigger if exists daily_puzzles_touch on public.daily_puzzles;
create trigger daily_puzzles_touch before update on public.daily_puzzles
  for each row execute function public.touch_updated_at();

drop trigger if exists daily_puzzle_solutions_touch on public.daily_puzzle_solutions;
create trigger daily_puzzle_solutions_touch before update on public.daily_puzzle_solutions
  for each row execute function public.touch_updated_at();

drop trigger if exists puzzle_attempts_touch on public.puzzle_attempts;
create trigger puzzle_attempts_touch before update on public.puzzle_attempts
  for each row execute function public.touch_updated_at();

-- ─── 6) Streak update trigger ────────────────────────────────────────────
-- Fires when an attempt transitions to solved. Updates the user's profile
-- counters atomically.
--   • streak += 1 if they also solved yesterday's puzzle (puzzle_date dates,
--     not wall-clock — a player who solves today's puzzle 30 min after
--     midnight still buckets correctly against yesterday's row).
--   • Otherwise resets to 1.
--   • puzzle_last_solved_date is the puzzle's date, NOT now().
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
  elsif prev = pdate then
    -- Already counted this puzzle's date. Don't double-count on UPDATE.
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

drop trigger if exists puzzle_attempts_streak on public.puzzle_attempts;
create trigger puzzle_attempts_streak
  after insert or update of solved_at on public.puzzle_attempts
  for each row execute function public.update_streak_on_solve();

-- ─── 7) Row-level security ───────────────────────────────────────────────
alter table public.daily_puzzles          enable row level security;
alter table public.daily_puzzle_solutions enable row level security;
alter table public.puzzle_attempts        enable row level security;

-- daily_puzzles: published rows on or before today are publicly readable.
-- Admins additionally see drafts/queued/future-dated rows so the admin UI
-- works.
drop policy if exists "daily_puzzles read live"   on public.daily_puzzles;
drop policy if exists "daily_puzzles read admin"  on public.daily_puzzles;
drop policy if exists "daily_puzzles write admin" on public.daily_puzzles;

create policy "daily_puzzles read live"
  on public.daily_puzzles for select using (
    status = 'published'
    and puzzle_date is not null
    and puzzle_date <= current_date
  );

create policy "daily_puzzles read admin"
  on public.daily_puzzles for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy "daily_puzzles write admin"
  on public.daily_puzzles for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- daily_puzzle_solutions: admin-only end-to-end. The player API runs
-- server-side with the service role and bypasses these policies — there
-- is no anon/authenticated path to this table by design.
drop policy if exists "puzzle_solutions admin all" on public.daily_puzzle_solutions;
create policy "puzzle_solutions admin all"
  on public.daily_puzzle_solutions for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- puzzle_attempts: own rows only. Insert is gated on the puzzle being
-- published and on or before today — this matches the daily_puzzles
-- read policy so a user can't pre-create attempts for tomorrow.
drop policy if exists "puzzle_attempts read own"   on public.puzzle_attempts;
drop policy if exists "puzzle_attempts insert own" on public.puzzle_attempts;
drop policy if exists "puzzle_attempts update own" on public.puzzle_attempts;

create policy "puzzle_attempts read own"
  on public.puzzle_attempts for select using (auth.uid() = user_id);

create policy "puzzle_attempts insert own"
  on public.puzzle_attempts for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.daily_puzzles dp
       where dp.id = puzzle_attempts.puzzle_id
         and dp.status = 'published'
         and dp.puzzle_date is not null
         and dp.puzzle_date <= current_date
    )
  );

create policy "puzzle_attempts update own"
  on public.puzzle_attempts for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
