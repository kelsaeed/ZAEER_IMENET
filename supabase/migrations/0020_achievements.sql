-- ─── Achievements ────────────────────────────────────────────────────────
-- A per-profile JSONB map of { achievementId: unlockedISODate }. Lets unlocked
-- achievements follow the player across devices and show up on their public
-- profile, instead of living only in one browser's localStorage.
--
-- No new RLS policies are needed: profiles already grant "read all" (so other
-- players can see your badges) and "update own" (so only you can write yours)
-- from migration 0001. Achievements are cosmetic, so client-side writes are an
-- acceptable trust level — same as the local-only version.
--
-- Idempotent: safe to run more than once.
alter table public.profiles
  add column if not exists achievements jsonb not null default '{}'::jsonb;
