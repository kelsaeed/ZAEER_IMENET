-- ─── Chat (match-bound + DM) ─────────────────────────────────────────────
-- Run AFTER 0001 and 0002 in Supabase → SQL Editor → New query.
-- Idempotent.

-- ─── 1. Match-bound chat ─────────────────────────────────────────────────
-- Messages tied to a single game. Anyone who can see the game can read,
-- and any participant of the game can send.

create table if not exists public.match_messages (
  id          bigserial primary key,
  game_id     uuid not null references public.games(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 500),
  created_at  timestamptz not null default now()
);

create index if not exists match_messages_game_idx
  on public.match_messages(game_id, created_at);

alter table public.match_messages enable row level security;

drop policy if exists "match_messages read" on public.match_messages;
drop policy if exists "match_messages send" on public.match_messages;

create policy "match_messages read"
  on public.match_messages for select using (
    exists (
      select 1 from public.games g
      where g.id = match_messages.game_id
      and (
        g.player1_id = auth.uid()
        or g.player2_id = auth.uid()
        or g.status = 'finished'
      )
    )
  );

create policy "match_messages send"
  on public.match_messages for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.games g
      where g.id = game_id
      and (g.player1_id = auth.uid() or g.player2_id = auth.uid())
    )
  );

alter publication supabase_realtime add table public.match_messages;

-- ─── 2. Direct messages ──────────────────────────────────────────────────
-- One row per message. The "thread" between two users is just a query
-- over (sender, recipient) pairs. To prevent spam, sending requires an
-- accepted friendship between the two users (enforced by RLS).

create table if not exists public.dm_messages (
  id            bigserial primary key,
  sender_id     uuid not null references public.profiles(id) on delete cascade,
  recipient_id  uuid not null references public.profiles(id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 500),
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  check (sender_id != recipient_id)
);

create index if not exists dm_messages_thread_idx
  on public.dm_messages(sender_id, recipient_id, created_at);
create index if not exists dm_messages_thread_rev_idx
  on public.dm_messages(recipient_id, sender_id, created_at);

alter table public.dm_messages enable row level security;

drop policy if exists "dm_messages read involved" on public.dm_messages;
drop policy if exists "dm_messages send to friend" on public.dm_messages;
drop policy if exists "dm_messages mark read" on public.dm_messages;

create policy "dm_messages read involved"
  on public.dm_messages for select using (
    auth.uid() = sender_id or auth.uid() = recipient_id
  );

create policy "dm_messages send to friend"
  on public.dm_messages for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = sender_id and f.addressee_id = recipient_id)
          or (f.requester_id = recipient_id and f.addressee_id = sender_id)
        )
    )
  );

-- Recipient can mark a message as read.
create policy "dm_messages mark read"
  on public.dm_messages for update using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

alter publication supabase_realtime add table public.dm_messages;
