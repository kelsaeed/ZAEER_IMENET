-- ─── Async / correspondence mode + your-turn notifications ──────────────
-- Run AFTER 0001..0007. Idempotent.
--
-- A match can now be one of:
--   • 'live'  — both players are sitting in the match, sync via Realtime
--               (existing behaviour, unchanged).
--   • 'async' — correspondence. You make a move and walk away; your
--               opponent gets a notification when they next open the site
--               and they come back later to play their move.
--
-- The `notifications` table is the durable side of "the bell". Realtime
-- already lights up the bell while a user is online; rows here mean the
-- ping survives a reload, a closed tab, or the user being away for hours.
-- Friend requests / DMs continue to live in their own tables — only the
-- new "your turn" pings flow through this table for now, but the schema
-- is generic enough to absorb other notification kinds later.

-- ─── 1) games: mode + last_move_at + awaiting_player_id ──────────────────
do $$ begin
  create type public.game_mode as enum ('live', 'async');
exception when duplicate_object then null; end $$;

alter table public.games
  add column if not exists mode public.game_mode not null default 'live';
alter table public.games
  add column if not exists last_move_at timestamptz;
alter table public.games
  add column if not exists awaiting_player_id uuid
    references public.profiles(id) on delete set null;

create index if not exists games_mode_status_idx
  on public.games(mode, status);
create index if not exists games_awaiting_idx
  on public.games(awaiting_player_id)
  where awaiting_player_id is not null;

-- ─── 2) notifications ────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,                  -- 'your_turn', etc.
  game_id     uuid references public.games(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  payload     jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;
create index if not exists notifications_user_game_kind_idx
  on public.notifications(user_id, game_id, kind)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications read own"   on public.notifications;
drop policy if exists "notifications update own" on public.notifications;
drop policy if exists "notifications delete own" on public.notifications;

create policy "notifications read own"
  on public.notifications for select using (auth.uid() = user_id);
create policy "notifications update own"
  on public.notifications for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
create policy "notifications delete own"
  on public.notifications for delete using (auth.uid() = user_id);
-- No INSERT policy on purpose — rows are only ever created by the
-- security-definer trigger below, never by the client.

-- ─── 3) BEFORE trigger: derive awaiting_player_id from state ─────────────
-- Single source of truth for "whose turn is it" is `state.currentPlayer`
-- (set by the game logic). We mirror that into a column so the lobby can
-- query it cheaply, and we bump `last_move_at` whenever the turn counter
-- actually advances — that's the timestamp the lobby/match show as
-- "moved 2h ago".

create or replace function public.sync_awaiting_from_state()
returns trigger
language plpgsql
as $$
declare
  cur int;
begin
  if new.status <> 'playing' then
    new.awaiting_player_id := null;
    return new;
  end if;
  cur := coalesce(nullif(new.state->>'currentPlayer','')::int, 1);
  new.awaiting_player_id := case
    when cur = 1 then new.player1_id
    when cur = 2 then new.player2_id
    else null
  end;
  if tg_op = 'UPDATE'
     and old.current_turn is distinct from new.current_turn then
    new.last_move_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists games_sync_awaiting on public.games;
create trigger games_sync_awaiting
  before insert or update on public.games
  for each row execute function public.sync_awaiting_from_state();

-- ─── 4) AFTER trigger: ping the player whose turn it just became ─────────
-- Only fires for async games. We dedupe by deleting any prior unread
-- 'your_turn' for the same (user, game) so a rapid back-and-forth in a
-- short window doesn't pile up multiple identical bell entries.

create or replace function public.notify_async_turn()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.mode <> 'async' then return new; end if;
  if new.status <> 'playing' then return new; end if;
  if new.awaiting_player_id is null then return new; end if;
  if tg_op = 'UPDATE'
     and old.awaiting_player_id is not distinct from new.awaiting_player_id then
    return new;
  end if;

  delete from public.notifications
   where user_id = new.awaiting_player_id
     and game_id = new.id
     and kind    = 'your_turn'
     and read_at is null;

  insert into public.notifications (user_id, kind, game_id, actor_id, payload)
  values (
    new.awaiting_player_id,
    'your_turn',
    new.id,
    case
      when new.awaiting_player_id = new.player1_id then new.player2_id
      else new.player1_id
    end,
    jsonb_build_object(
      'turn',         new.current_turn,
      'match_number', new.match_number
    )
  );

  return new;
end;
$$;

drop trigger if exists games_notify_async_turn on public.games;
create trigger games_notify_async_turn
  after insert or update on public.games
  for each row execute function public.notify_async_turn();

-- ─── 5) Realtime ─────────────────────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;
