-- ─── Time control on online games ────────────────────────────────────────
-- Run AFTER 0001..0008. Idempotent.
--
-- A live game can now have a chess-style clock attached. The shape lives
-- in JSON so we can evolve presets / extra fields without another ALTER:
--
--   { "kind": "none" }
--
--     — untimed (default; preserves existing behaviour for every existing
--       row, since the column has a server default).
--
--   { "kind": "clock",
--     "matchSeconds":   600,    -- per-player match clock (Fischer-style)
--     "increment":       0,     -- seconds added after each move (>=0)
--     "perMoveSeconds":  0      -- hard cap on a single move; 0 = no cap
--   }
--
-- The lobby filters Quick Match by the SAME settings so a player picking
-- "10+0 rapid" never lands in someone else's "1+0 bullet" room. Async
-- games are always untimed by product decision (you can't have a chess
-- clock on a correspondence match) — the app refuses to set anything
-- other than 'none' when mode='async'.

-- ─── 1) games.time_control ───────────────────────────────────────────────
alter table public.games
  add column if not exists time_control jsonb not null default '{"kind":"none"}'::jsonb;

create index if not exists games_time_control_kind_idx
  on public.games((time_control->>'kind'));

-- ─── 2) Sanity check — a guard so future writes can't store async + clock
-- The check is NOT VALID at first to leave any legacy rows alone, then we
-- VALIDATE so new writes have to pass.
do $$ begin
  alter table public.games
    add constraint games_async_is_untimed
    check (mode <> 'async' or (time_control->>'kind') = 'none')
    not valid;
exception when duplicate_object then null; end $$;

-- Existing rows: backfill async games to 'none' just in case the default
-- ever shifts, then validate the constraint.
update public.games
   set time_control = '{"kind":"none"}'::jsonb
 where mode = 'async'
   and (time_control->>'kind') is distinct from 'none';

do $$ begin
  alter table public.games validate constraint games_async_is_untimed;
exception when invalid_text_representation then null;
         when undefined_object then null; end $$;
