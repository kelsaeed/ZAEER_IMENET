-- ─── Social: blocks + chat mutes ──────────────────────────────────────────
-- Run AFTER 0001..0006. Idempotent.
--
-- Adds two tiny tables backing the in-match opponent menu:
--
--   • user_blocks      — "I never want to be matched with / messaged by
--                        this user". Unidirectional: A blocking B does
--                        not block A from B's perspective in this table,
--                        but the app should treat it as a mutual cut-off.
--   • chat_mutes       — "I don't want to see THIS user's chat messages".
--                        Unidirectional. The other side keeps writing;
--                        the muter just filters them out client-side.
--
-- Both are deliberately separate from `friendships` because the actions
-- are independent: I can mute a friend without unfriending them, and I
-- can block someone I was never friends with.

-- ─── 1) user_blocks ───────────────────────────────────────────────────────
create table if not exists public.user_blocks (
  blocker_id  uuid not null references public.profiles(id) on delete cascade,
  blocked_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id != blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "blocks read own"   on public.user_blocks;
drop policy if exists "blocks insert own" on public.user_blocks;
drop policy if exists "blocks delete own" on public.user_blocks;

-- A user only ever sees their own block list.
create policy "blocks read own"
  on public.user_blocks for select using (auth.uid() = blocker_id);
create policy "blocks insert own"
  on public.user_blocks for insert with check (auth.uid() = blocker_id);
create policy "blocks delete own"
  on public.user_blocks for delete using (auth.uid() = blocker_id);

-- ─── 2) chat_mutes ────────────────────────────────────────────────────────
create table if not exists public.chat_mutes (
  muter_id    uuid not null references public.profiles(id) on delete cascade,
  muted_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (muter_id, muted_id),
  check (muter_id != muted_id)
);

alter table public.chat_mutes enable row level security;

drop policy if exists "mutes read own"   on public.chat_mutes;
drop policy if exists "mutes insert own" on public.chat_mutes;
drop policy if exists "mutes delete own" on public.chat_mutes;

create policy "mutes read own"
  on public.chat_mutes for select using (auth.uid() = muter_id);
create policy "mutes insert own"
  on public.chat_mutes for insert with check (auth.uid() = muter_id);
create policy "mutes delete own"
  on public.chat_mutes for delete using (auth.uid() = muter_id);
