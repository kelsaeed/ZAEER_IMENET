-- ─── All built-in themes free; one premium theme added ─────────────────
-- Run AFTER 0014. Idempotent.
--
-- Course-correction: the seven built-in themes from 0014 ship as part
-- of the base game now (every legacy player already had access to them
-- before the catalog existed). Crimson, Forest and Royal are dropped
-- back to free, and a new headline 'celestial' theme takes the paid
-- slot — it pairs with <ThemeDecor/> in the runtime to render animated
-- sparkles, sweeping ribbons, an aurora curtain and a top bloom that
-- you only get with this skin.

-- 1. Free up the previously paid built-ins. The trigger from 0014
--    grants free themes on signup; the backfill below extends that to
--    every existing profile in one shot.
update public.themes_catalog
   set price_cents = 0
 where id in ('crimson', 'forest', 'royal');

-- 2. Insert the celestial theme. sort_order = 5 puts it at the front
--    of the store grid so it's the first thing shoppers see.
insert into public.themes_catalog
  (id, display_name, display_name_ar, description, description_ar, price_cents, is_published, sort_order)
values
  ('celestial', 'Celestial Glow', 'الوهج السماوي',
   'Light pearl, rose-gold and amethyst — the only light-themed board, with animated sparkles, sweeping ribbons of light and a soft aurora curtain that follow you everywhere.',
   'لؤلؤي فاتح وذهبي وردي وبنفسجي — المظهر الفاتح الوحيد، مع بريق متحرك وأشرطة ضوء منسابة وستارة شفق ناعمة ترافقك في كل مكان.',
   299, true, 5)
on conflict (id) do update set
  display_name    = excluded.display_name,
  display_name_ar = excluded.display_name_ar,
  description     = excluded.description,
  description_ar  = excluded.description_ar,
  price_cents     = excluded.price_cents,
  is_published    = excluded.is_published,
  sort_order      = excluded.sort_order;

-- 3. Re-run the backfill so every existing profile owns the now-free
--    crimson / forest / royal themes. on conflict do nothing keeps
--    this idempotent — re-running 0015 is a no-op.
insert into public.theme_ownership (user_id, theme_id, acquired_via)
select p.id, c.id, 'free_grant'
  from public.profiles p
 cross join public.themes_catalog c
 where c.price_cents = 0 and c.is_published
on conflict (user_id, theme_id) do nothing;
