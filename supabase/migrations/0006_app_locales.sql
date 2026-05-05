-- ─── Shared, admin-edited translations and locales ─────────────────────
-- Run AFTER 0001..0005. Idempotent.
--
-- Why this exists
-- ---------------
-- The "Edit translations" / "Add language" tabs in the Settings panel used
-- to write to localStorage on the editor's device only — meaning every
-- player saw the built-in strings and only the admin saw their own edits.
-- The intent was always for translation work to be a shared, system-wide
-- act: the admin tweaks a string, every player on every device sees the
-- new value next time they open the app (or live, via Realtime).
--
-- Two tables:
--   • app_locales              — custom languages added by an admin.
--                                 Built-in locales (en, ar) live in code
--                                 and don't appear here.
--   • app_translation_overrides — per-locale (key → value) map. Applied
--                                 on top of the locale's static strings,
--                                 falling back to English then the key.

-- ─── 1) Custom locales ─────────────────────────────────────────────────
create table if not exists public.app_locales (
  id         text primary key,                  -- e.g. 'fr', 'es-419'
  name       text not null,
  flag       text not null default '🏳️',
  base_id    text not null default 'en',
  dir        text not null default 'ltr' check (dir in ('ltr','rtl')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ─── 2) Translation overrides ──────────────────────────────────────────
create table if not exists public.app_translation_overrides (
  locale_id  text not null,
  key        text not null,
  value      text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (locale_id, key)
);

create index if not exists app_overrides_locale_idx
  on public.app_translation_overrides (locale_id);

-- ─── 3) Row-level security ─────────────────────────────────────────────
alter table public.app_locales                 enable row level security;
alter table public.app_translation_overrides   enable row level security;

-- Read: open to anyone (translations are public content; the app even
-- shows them on /login before the user is signed in).
drop policy if exists app_locales_select   on public.app_locales;
drop policy if exists app_overrides_select on public.app_translation_overrides;

create policy app_locales_select   on public.app_locales                 for select using (true);
create policy app_overrides_select on public.app_translation_overrides   for select using (true);

-- Write (insert / update / delete): admins only. Backed by profiles.is_admin.
drop policy if exists app_locales_admin_write   on public.app_locales;
drop policy if exists app_overrides_admin_write on public.app_translation_overrides;

create policy app_locales_admin_write on public.app_locales
  for all
  using      (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy app_overrides_admin_write on public.app_translation_overrides
  for all
  using      (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ─── 4) Realtime — broadcast changes so connected clients pick up edits
--          live, without needing to refresh.
do $$
begin
  begin
    alter publication supabase_realtime add table public.app_locales;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.app_translation_overrides;
  exception when duplicate_object then null;
  end;
end $$;
