-- ─── Friends, avatars, rematch ────────────────────────────────────────────
-- Run this AFTER 0001_init.sql in Supabase → SQL Editor → New query.
-- Idempotent: safe to re-run.

-- ─── 1. Friendships ───────────────────────────────────────────────────────
do $$ begin
  create type public.friendship_status as enum ('pending', 'accepted');
exception when duplicate_object then null; end $$;

create table if not exists public.friendships (
  id            bigserial primary key,
  requester_id  uuid not null references public.profiles(id) on delete cascade,
  addressee_id  uuid not null references public.profiles(id) on delete cascade,
  status        public.friendship_status not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(requester_id, addressee_id),
  check (requester_id != addressee_id)
);

create index if not exists friendships_addressee_idx on public.friendships(addressee_id);
create index if not exists friendships_status_idx     on public.friendships(status);

drop trigger if exists friendships_touch on public.friendships;
create trigger friendships_touch before update on public.friendships
  for each row execute function public.touch_updated_at();

alter table public.friendships enable row level security;

drop policy if exists "friendships read involved"  on public.friendships;
drop policy if exists "friendships request"        on public.friendships;
drop policy if exists "friendships accept own"     on public.friendships;
drop policy if exists "friendships delete own"     on public.friendships;

create policy "friendships read involved"
  on public.friendships for select using (
    auth.uid() = requester_id or auth.uid() = addressee_id
  );
-- Sending a request: only as yourself.
create policy "friendships request"
  on public.friendships for insert with check (
    auth.uid() = requester_id
  );
-- Accepting / declining: only the addressee can change status.
create policy "friendships accept own"
  on public.friendships for update using (
    auth.uid() = addressee_id
  ) with check (auth.uid() = addressee_id);
-- Removing: either side can break a friendship or rescind a request.
create policy "friendships delete own"
  on public.friendships for delete using (
    auth.uid() = requester_id or auth.uid() = addressee_id
  );

alter publication supabase_realtime add table public.friendships;

-- ─── 2. Rematch + series score on games ──────────────────────────────────
alter table public.games
  add column if not exists p1_ready          boolean not null default false,
  add column if not exists p2_ready          boolean not null default false,
  add column if not exists series_p1_wins    int     not null default 0,
  add column if not exists series_p2_wins    int     not null default 0,
  add column if not exists match_number      int     not null default 1;

-- ─── 3. Avatars storage bucket ───────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Storage policies. Anyone reads (public bucket); only the owner can write
-- to a path under their own user id (e.g. "<uid>/avatar.png").
drop policy if exists "avatars read all"     on storage.objects;
drop policy if exists "avatars upload own"   on storage.objects;
drop policy if exists "avatars update own"   on storage.objects;
drop policy if exists "avatars delete own"   on storage.objects;

create policy "avatars read all"
  on storage.objects for select using (bucket_id = 'avatars');

create policy "avatars upload own"
  on storage.objects for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars update own"
  on storage.objects for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars delete own"
  on storage.objects for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
