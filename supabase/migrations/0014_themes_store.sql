-- ─── Theme store + ownership ────────────────────────────────────────────
-- Run AFTER 0001..0013. Idempotent.
--
-- Two tables and one RPC turn the existing built-in theme list into an
-- ownership-gated catalog so cosmetic monetization can sit on top.
--
--   themes_catalog    one row per theme id (matches src/game/themes.ts).
--                     Carries display name, description, price, and
--                     publish flag. Public-readable so the store grid
--                     can render even for signed-out browsers.
--
--   theme_ownership   (user_id, theme_id) pairs the user has acquired.
--                     Owner-readable only — no leaderboard of who owns
--                     what. Inserts go through acquire_free_theme()
--                     (free) or a future stripe-webhook RPC (paid),
--                     never via direct client insert.
--
-- Free themes are auto-granted on first sign-up (handle_new_user) and
-- back-filled to existing profiles below, so anyone visiting today
-- already owns the same set they had access to before this migration.

-- ─── Tables ──────────────────────────────────────────────────────────────

create table if not exists public.themes_catalog (
  -- Matches the string id in src/game/themes.ts (e.g. 'navy', 'aurora').
  id              text primary key,
  display_name    text not null,
  -- Arabic name kept on the row so the store can localize without a
  -- separate translations join.
  display_name_ar text,
  description     text,
  description_ar  text,
  -- 0 = free (auto-granted to every user). Anything > 0 shows as
  -- "Coming soon" in the UI until the Stripe integration lands.
  price_cents     int  not null default 0,
  -- Hide unfinished or retired themes without deleting the catalog row
  -- (so existing ownership rows still resolve).
  is_published    boolean not null default true,
  -- Tile order in the store grid.
  sort_order      int  not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.theme_ownership (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  theme_id     text not null references public.themes_catalog(id) on delete cascade,
  -- 'free_grant' (auto-granted on signup or via acquire_free_theme),
  -- 'admin_grant' (manually inserted by an admin), 'purchase' (future).
  acquired_via text not null default 'free_grant',
  acquired_at  timestamptz not null default now(),
  primary key (user_id, theme_id)
);

create index if not exists theme_ownership_user_idx on public.theme_ownership(user_id);

-- updated_at touch trigger for the catalog (ownership rows are immutable
-- after creation — re-acquiring a theme is a no-op).
drop trigger if exists themes_catalog_touch on public.themes_catalog;
create trigger themes_catalog_touch before update on public.themes_catalog
  for each row execute function public.touch_updated_at();

-- ─── Row-Level Security ──────────────────────────────────────────────────

alter table public.themes_catalog  enable row level security;
alter table public.theme_ownership enable row level security;

-- Catalog: published themes visible to anyone (so the store renders for
-- signed-out browsers too); admins can see and edit unpublished rows.
drop policy if exists "themes_catalog read published" on public.themes_catalog;
drop policy if exists "themes_catalog admin read all" on public.themes_catalog;
drop policy if exists "themes_catalog admin write"    on public.themes_catalog;
create policy "themes_catalog read published"
  on public.themes_catalog for select using (is_published = true);
create policy "themes_catalog admin read all"
  on public.themes_catalog for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
create policy "themes_catalog admin write"
  on public.themes_catalog for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Ownership: each user sees only their own rows. No direct insert/update
-- from the client — only the SECURITY DEFINER RPCs below can write.
drop policy if exists "theme_ownership read own" on public.theme_ownership;
create policy "theme_ownership read own"
  on public.theme_ownership for select using (auth.uid() = user_id);

-- ─── RPC: claim a free theme ────────────────────────────────────────────
-- Client calls this for free-priced themes. Paid themes will go through
-- a separate stripe-webhook function once payment is wired up; we keep
-- this one intentionally narrow (price_cents = 0 only) so a leaked
-- function call can't grant a paid skin.

create or replace function public.acquire_free_theme(p_theme_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  is_free boolean;
begin
  if uid is null then
    return false;
  end if;

  select (price_cents = 0 and is_published)
    into is_free
    from public.themes_catalog
   where id = p_theme_id;

  if is_free is null or not is_free then
    return false;
  end if;

  insert into public.theme_ownership (user_id, theme_id, acquired_via)
  values (uid, p_theme_id, 'free_grant')
  on conflict (user_id, theme_id) do nothing;

  return true;
end;
$$;

revoke all on function public.acquire_free_theme(text) from public;
grant execute on function public.acquire_free_theme(text) to authenticated;

-- ─── Auto-grant free themes on signup ───────────────────────────────────
-- Wired into the existing handle_new_user trigger from migration 0001 so
-- every new auth.users row gets ownership of every published free theme
-- before the user can even open the store.

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
  while exists (select 1 from public.profiles where username = uname) loop
    uname := uname || floor(random() * 1000)::text;
  end loop;
  insert into public.profiles (id, username, display_name)
  values (new.id, uname, dname)
  on conflict (id) do nothing;

  -- Grant every published free theme. Wrapped in a separate insert so
  -- a missing themes_catalog row (this migration not run yet on a
  -- branch) still lets sign-up succeed.
  begin
    insert into public.theme_ownership (user_id, theme_id, acquired_via)
    select new.id, c.id, 'free_grant'
      from public.themes_catalog c
     where c.price_cents = 0 and c.is_published
    on conflict (user_id, theme_id) do nothing;
  exception when others then
    null;
  end;

  return new;
end;
$$;

-- ─── Gate profiles.theme_id to owned themes ─────────────────────────────
-- Soft enforcement: a profile can only equip a theme it owns (or the
-- 'custom' builder, which has no catalog row). Default 'navy' is granted
-- by the trigger above, so brand-new profiles always satisfy this.

create or replace function public.enforce_owned_theme()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.theme_id is null or new.theme_id = 'custom' then
    return new;
  end if;
  if exists (
    select 1 from public.theme_ownership
     where user_id = new.id and theme_id = new.theme_id
  ) then
    return new;
  end if;
  -- Theme isn't owned: silently fall back to the default rather than
  -- raise an exception, so an unmigrated client picking a paid theme
  -- doesn't end up with a broken settings panel.
  new.theme_id := 'navy';
  return new;
end;
$$;

drop trigger if exists profiles_enforce_owned_theme on public.profiles;
create trigger profiles_enforce_owned_theme
  before insert or update of theme_id on public.profiles
  for each row execute function public.enforce_owned_theme();

-- ─── Seed: the 7 built-in themes from src/game/themes.ts ────────────────
-- Free: navy (default), aurora, mono, olive. Paid: crimson, forest,
-- royal — they show as "Coming soon" until Stripe is wired up.
-- on conflict (id) do update so re-running this migration after
-- editing names / prices picks up the change.

insert into public.themes_catalog
  (id, display_name, display_name_ar, description, description_ar, price_cents, is_published, sort_order)
values
  ('navy',    'Royal Sapphire',  'الياقوت الملكي',
   'Deep blues with warm gold pieces — the default look.',
   'أزرق عميق مع قطع ذهبية دافئة — المظهر الافتراضي.',
   0, true, 10),
  ('aurora',  'Aurora Nights',   'ليالي الشفق',
   'Violet and emerald, like a sky on a cold night.',
   'بنفسجي وزمرّدي، كسماء في ليلة باردة.',
   0, true, 20),
  ('mono',    'Black & White',   'أبيض وأسود',
   'Monochrome — pure focus, nothing to distract.',
   'أحادي اللون — تركيز خالص بلا مشتتات.',
   0, true, 30),
  ('olive',   'Olive Battlefield', 'ساحة الزيتون',
   'Earthy greens for a quiet, grounded board.',
   'أخضر ترابي لرقعة هادئة وراسخة.',
   0, true, 40),
  ('crimson', 'Crimson Empire',  'الإمبراطورية القرمزية',
   'Blood red and gold. For the bold.',
   'أحمر دموي وذهبي. للجريئين.',
   299, true, 50),
  ('forest',  'Emerald Forest',  'الغابة الزمردية',
   'Deep green canopy, amber pieces, sunset throne.',
   'مظلة خضراء عميقة، قطع كهرمانية، عرش غروب.',
   299, true, 60),
  ('royal',   'Royal Purple',    'الأرجواني الملكي',
   'Saturated purples with amber accents — premium.',
   'أرجواني مشبع بلمسات كهرمانية — فاخر.',
   499, true, 70)
on conflict (id) do update set
  display_name    = excluded.display_name,
  display_name_ar = excluded.display_name_ar,
  description     = excluded.description,
  description_ar  = excluded.description_ar,
  price_cents     = excluded.price_cents,
  is_published    = excluded.is_published,
  sort_order      = excluded.sort_order;

-- ─── Backfill: grant free themes to existing profiles ───────────────────
-- One-shot so anyone who signed up before 0014 keeps the same theme
-- access they had on day one (when every theme was free).

insert into public.theme_ownership (user_id, theme_id, acquired_via)
select p.id, c.id, 'free_grant'
  from public.profiles p
 cross join public.themes_catalog c
 where c.price_cents = 0 and c.is_published
on conflict (user_id, theme_id) do nothing;

-- ─── Realtime ───────────────────────────────────────────────────────────
-- Catalog edits propagate live so admin price/copy changes reflect in
-- open store tabs. Ownership changes propagate so a multi-tab claim
-- updates the other tab's "Owned" pill without a refresh.

do $$
begin
  begin
    alter publication supabase_realtime add table public.themes_catalog;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.theme_ownership;
  exception when duplicate_object then null;
  end;
end $$;
