-- ─── Per-player visual theme ────────────────────────────────────────────
-- Run AFTER 0001..0012. Idempotent.
--
-- Each profile carries its preferred theme id so the BOARD itself can
-- be split: the local player's half (background + their pieces) uses
-- their theme; the opponent's half + opponent pieces use the opponent's
-- theme. Both sides see the same data — no symmetric "my theme on me,
-- their theme on them" asymmetry — so a screenshot of the match looks
-- identical from either viewer.
--
-- This is foundational for cosmetic monetization (theme bundles, piece
-- skins). The runtime side reads these into a PlayerThemesProvider
-- context; nothing else in the schema needs to know about them.

alter table public.profiles
  add column if not exists theme_id text not null default 'navy';

-- profiles.username already has a unique index; theme_id is just a
-- per-row pref so no extra index needed. RLS already allows the user
-- to update their own row, which covers the settings-panel write path.
