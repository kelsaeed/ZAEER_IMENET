-- ─── Zaeer Imenet — initial schema ────────────────────────────────────────
-- Run this in the Supabase SQL editor (Project → SQL → New query → paste → run).
-- It is idempotent: safe to re-run.

-- ─── Tables ──────────────────────────────────────────────────────────────

-- 1. profiles — public-readable user info, 1-to-1 with auth.users.
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  display_name  text not null,
  avatar_url    text,
  bio           text,
  is_admin      boolean not null default false,
  rating        int     not null default 1000,
  wins          int     not null default 0,
  losses        int     not null default 0,
  draws         int     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 2. games — one row per match.
do $$ begin
  create type public.game_status as enum ('waiting', 'playing', 'finished', 'abandoned');
exception when duplicate_object then null; end $$;

create table if not exists public.games (
  id            uuid primary key default gen_random_uuid(),
  player1_id    uuid references public.profiles(id) on delete set null,
  player2_id    uuid references public.profiles(id) on delete set null,
  status        public.game_status not null default 'waiting',
  winner_id     uuid references public.profiles(id) on delete set null,
  state         jsonb not null,                 -- the current GameState
  current_turn  int   not null default 0,
  is_public     boolean not null default true,  -- false = invite-only
  invite_code   text unique,                    -- short code for friends
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

create index if not exists games_status_idx on public.games(status);
create index if not exists games_p1_idx     on public.games(player1_id);
create index if not exists games_p2_idx     on public.games(player2_id);
create index if not exists games_invite_idx on public.games(invite_code);

-- 3. moves — append-only log for replay & audit.
create table if not exists public.moves (
  id          bigserial primary key,
  game_id     uuid not null references public.games(id) on delete cascade,
  player_id   uuid not null references public.profiles(id) on delete cascade,
  turn        int  not null,
  payload     jsonb not null,                   -- raw move action
  created_at  timestamptz not null default now()
);

create index if not exists moves_game_idx on public.moves(game_id, turn);

-- ─── Triggers ────────────────────────────────────────────────────────────

-- Auto-create a profile row whenever a new auth.users record appears.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  uname text;
  dname text;
begin
  uname := coalesce(
    new.raw_user_meta_data->>'username',
    'user_' || substr(replace(new.id::text, '-', ''), 1, 8)
  );
  dname := coalesce(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    'Player'
  );
  -- Make sure username is unique by appending numbers if collision.
  while exists (select 1 from public.profiles where username = uname) loop
    uname := uname || floor(random() * 1000)::text;
  end loop;
  insert into public.profiles (id, username, display_name)
  values (new.id, uname, dname)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at touch trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists games_touch on public.games;
create trigger games_touch before update on public.games
  for each row execute function public.touch_updated_at();

-- ─── Row-Level Security ──────────────────────────────────────────────────
-- Every table is locked by default; policies grant just what's needed.

alter table public.profiles enable row level security;
alter table public.games    enable row level security;
alter table public.moves    enable row level security;

-- profiles: publicly readable, user can only update own row.
drop policy if exists "profiles read all"       on public.profiles;
drop policy if exists "profiles update own"     on public.profiles;
create policy "profiles read all"
  on public.profiles for select using (true);
create policy "profiles update own"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- games: visible to participants, public after finish; create as p1; updates by participants.
drop policy if exists "games read participants"  on public.games;
drop policy if exists "games insert as p1"       on public.games;
drop policy if exists "games update participants" on public.games;
drop policy if exists "games read public waiting" on public.games;
create policy "games read participants"
  on public.games for select using (
    auth.uid() = player1_id or auth.uid() = player2_id or status = 'finished'
  );
create policy "games read public waiting"
  on public.games for select using (
    is_public = true and status = 'waiting'
  );
create policy "games insert as p1"
  on public.games for insert with check (auth.uid() = player1_id);
create policy "games update participants"
  on public.games for update using (
    auth.uid() = player1_id or auth.uid() = player2_id
  );

-- moves: read if you can see the game; insert only as yourself, only on a playing game you're in.
drop policy if exists "moves read in own games"  on public.moves;
drop policy if exists "moves insert own"         on public.moves;
create policy "moves read in own games"
  on public.moves for select using (
    exists (
      select 1 from public.games g
      where g.id = moves.game_id
        and (g.player1_id = auth.uid() or g.player2_id = auth.uid() or g.status = 'finished')
    )
  );
create policy "moves insert own"
  on public.moves for insert with check (
    auth.uid() = player_id
    and exists (
      select 1 from public.games g
      where g.id = moves.game_id
        and (g.player1_id = auth.uid() or g.player2_id = auth.uid())
        and g.status = 'playing'
    )
  );

-- ─── Realtime (so clients can subscribe to live updates) ────────────────
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.moves;
alter publication supabase_realtime add table public.profiles;
