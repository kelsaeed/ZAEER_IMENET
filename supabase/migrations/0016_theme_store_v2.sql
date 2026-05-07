-- ─── Theme store v2 — admin authoring, discounts, codes, admin override ─
-- Run AFTER 0015. Idempotent.
--
-- Catalog gains the fields needed to drive the storefront from the DB
-- alone:
--
--   theme_data        full JSON spec (matches the Theme TS interface).
--                     null on rows that point to a built-in (resolved
--                     from src/game/themes.ts at runtime). Set by an
--                     admin via /admin/themes to ship a brand-new
--                     theme without a code release.
--   decor_kind        which animated overlay to render with this theme
--                     ('none' | 'celestial' | future). Drives ThemeDecor.
--   discount_pct      0..100 percent off (combines with discount_ends_at)
--   discount_ends_at  null = always-on while pct>0; otherwise an
--                     expiration timestamp.
--   free_until        if > now() the theme is effectively free (used
--                     for limited-time giveaways).
--   is_premium        marketing flag for "this is a paid skin" — drives
--                     UI copy independent of effective price.
--
-- A new theme_redeem_codes table holds one-time codes that an admin
-- can hand out. The table is admin-only; players redeem via an RPC
-- which is the only path that touches the row from outside.
--
-- enforce_owned_theme is updated so admins can equip any theme without
-- owning it — they're the ones authoring + testing the catalog.

-- ─── Catalog v2 columns ──────────────────────────────────────────────────

alter table public.themes_catalog
  add column if not exists theme_data       jsonb,
  add column if not exists decor_kind       text not null default 'none',
  add column if not exists discount_pct     int  not null default 0
    check (discount_pct between 0 and 100),
  add column if not exists discount_ends_at timestamptz,
  add column if not exists free_until       timestamptz,
  add column if not exists is_premium       boolean not null default false;

-- Tag the celestial theme so ThemeDecor knows which decor pack to play.
update public.themes_catalog
   set decor_kind = 'celestial',
       is_premium = true
 where id = 'celestial';

-- ─── Effective-price helper ──────────────────────────────────────────────
-- One canonical computation so /store, the admin page and acquire_free_theme
-- all see the same number. SQL function so RLS / future server-side
-- billing checks can use it without round-tripping to the client.

create or replace function public.theme_effective_price_cents(p_id text)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when c.free_until is not null and c.free_until > now() then 0
    when c.discount_pct > 0
      and (c.discount_ends_at is null or c.discount_ends_at > now())
      then greatest(0, (c.price_cents * (100 - c.discount_pct)) / 100)
    else c.price_cents
  end
  from public.themes_catalog c
  where c.id = p_id;
$$;

revoke all on function public.theme_effective_price_cents(text) from public;
grant execute on function public.theme_effective_price_cents(text) to anon, authenticated;

-- ─── Redeem codes ────────────────────────────────────────────────────────
-- One-time codes admins generate to hand out a theme for free. Player
-- redeems via redeem_theme_code(p_code) — they never see the table.

create table if not exists public.theme_redeem_codes (
  code         text primary key,
  theme_id     text not null references public.themes_catalog(id) on delete cascade,
  note         text,
  -- Tracking only — not used for auth.
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- Set once on first successful redeem; stays set forever after that.
  used_by      uuid references public.profiles(id) on delete set null,
  used_at      timestamptz,
  -- Optional shelf life.
  expires_at   timestamptz
);

create index if not exists theme_codes_theme_idx   on public.theme_redeem_codes(theme_id);
create index if not exists theme_codes_used_by_idx on public.theme_redeem_codes(used_by);

alter table public.theme_redeem_codes enable row level security;

-- Codes table is admin-only for direct read AND write. Even seeing the
-- raw codes is sensitive (an admin doesn't want a logged-in player
-- enumerating valid codes to grab themes they didn't pay for).
drop policy if exists "redeem_codes admin all" on public.theme_redeem_codes;
create policy "redeem_codes admin all"
  on public.theme_redeem_codes for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ─── RPC: redeem a code ──────────────────────────────────────────────────
-- security definer so it can read the otherwise-hidden codes table. The
-- function doubles as a one-time guard: a row update with used_by=null
-- in the where-clause means a second concurrent redeem can't both
-- succeed (the first one wins, the second sees rec=null).

create or replace function public.redeem_theme_code(p_code text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  rec record;
  updated int;
begin
  if uid is null then return false; end if;

  select * into rec
    from public.theme_redeem_codes
   where code = p_code
     and used_by is null
     and (expires_at is null or expires_at > now())
   for update;

  if rec is null then return false; end if;

  update public.theme_redeem_codes
     set used_by = uid, used_at = now()
   where code = p_code and used_by is null;
  get diagnostics updated = row_count;
  if updated = 0 then return false; end if;

  insert into public.theme_ownership (user_id, theme_id, acquired_via)
  values (uid, rec.theme_id, 'redeem_code')
  on conflict (user_id, theme_id) do nothing;

  return true;
end;
$$;

revoke all on function public.redeem_theme_code(text) from public;
grant execute on function public.redeem_theme_code(text) to authenticated;

-- ─── RPC: admin-only redeem-code generator ───────────────────────────────
-- Convenience so the admin page doesn't need to roll its own random
-- string. Caller can pass p_code to use a vanity string instead.

create or replace function public.create_theme_redeem_code(
  p_theme_id text,
  p_code text default null,
  p_note text default null,
  p_expires_at timestamptz default null
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  is_admin boolean;
  final_code text;
begin
  select p.is_admin into is_admin from public.profiles p where p.id = uid;
  if not coalesce(is_admin, false) then
    raise exception 'admin only';
  end if;

  -- 12-char hex from a fresh md5. Uppercase for readability over the
  -- phone / on chat. Collisions on 12 hex chars are statistically
  -- negligible for the volumes this feature supports.
  final_code := coalesce(
    nullif(trim(p_code), ''),
    upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12))
  );

  insert into public.theme_redeem_codes (code, theme_id, note, created_by, expires_at)
  values (final_code, p_theme_id, p_note, uid, p_expires_at);

  return final_code;
end;
$$;

revoke all on function public.create_theme_redeem_code(text, text, text, timestamptz) from public;
grant execute on function public.create_theme_redeem_code(text, text, text, timestamptz) to authenticated;

-- ─── acquire_free_theme — honor free_until + 100% discount ──────────────
-- Replaces the price_cents = 0 check from 0014 with the canonical
-- effective-price helper, so a "free until tomorrow" giveaway can
-- be claimed without flipping the row's price.

create or replace function public.acquire_free_theme(p_theme_id text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  effective int;
  pub boolean;
begin
  if uid is null then return false; end if;

  select c.is_published, public.theme_effective_price_cents(c.id)
    into pub, effective
    from public.themes_catalog c where c.id = p_theme_id;

  if pub is null or not pub or effective is null or effective > 0 then
    return false;
  end if;

  insert into public.theme_ownership (user_id, theme_id, acquired_via)
  values (uid, p_theme_id, 'free_grant')
  on conflict (user_id, theme_id) do nothing;
  return true;
end;
$$;

-- ─── enforce_owned_theme — admin override ───────────────────────────────
-- Admins are the ones authoring and QA-ing the catalog. Make them
-- own everything implicitly so they can equip any theme — including
-- unpublished or work-in-progress ones — without polluting the
-- ownership table.

create or replace function public.enforce_owned_theme()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.theme_id is null or new.theme_id = 'custom' then
    return new;
  end if;

  if exists (select 1 from public.profiles p where p.id = new.id and p.is_admin) then
    return new;
  end if;

  if exists (
    select 1 from public.theme_ownership
     where user_id = new.id and theme_id = new.theme_id
  ) then
    return new;
  end if;

  new.theme_id := 'navy';
  return new;
end;
$$;
