-- ─── API rate limiting (fixed window) ───────────────────────────────────
-- Run AFTER 0001..0018. Idempotent.
--
-- Why this exists
-- ---------------
-- The server-authoritative move route re-runs the engine and writes via the
-- service role on every action. An authed user can't break the rules, but
-- they CAN spam legal/malformed requests and hammer the DB + Realtime. This
-- adds a tiny atomic fixed-window counter the route checks per request.
--
-- The route ALSO has a per-instance in-memory pre-filter (see
-- src/lib/server/rateLimit.ts); this table is the authoritative,
-- cross-instance layer. The route fails OPEN if this RPC errors, so applying
-- this migration is what turns durable limiting on — it is safe to deploy the
-- code first.

create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        int         not null default 0
);

-- Lock the table down: only the SECURITY DEFINER function below (and the
-- service role) ever touch it. Clients have no direct access.
alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;

-- ─── Atomic hit-and-check ────────────────────────────────────────────────
-- One upsert per call. Resets the window in place when it has elapsed, else
-- increments. Returns whether the caller is still within `p_limit` and, if
-- not, how many seconds until the window resets. Mirrors the pure
-- `evaluateFixedWindow` in rateLimit.ts.
create or replace function public.rate_limit_hit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns table (allowed boolean, retry_after int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now          timestamptz := now();
  v_window_start timestamptz;
  v_count        int;
  v_window       interval := make_interval(secs => p_window_seconds);
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set window_start = case
          when rl.window_start < v_now - v_window then v_now
          else rl.window_start end,
        count = case
          when rl.window_start < v_now - v_window then 1
          else rl.count + 1 end
  returning rl.window_start, rl.count into v_window_start, v_count;

  if v_count <= p_limit then
    allowed := true;
    retry_after := 0;
  else
    allowed := false;
    retry_after := greatest(
      1,
      ceil(extract(epoch from (v_window_start + v_window - v_now)))::int
    );
  end if;

  -- Opportunistic cleanup: ~1% of calls sweep rows whose window opened over
  -- an hour ago (long dead — every live window is seconds long). Keeps the
  -- table bounded without a cron job. Cheap because it's rare and indexed by
  -- the implicit pk scan over a small table.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < v_now - interval '1 hour';
  end if;

  return next;
end;
$$;

revoke all on function public.rate_limit_hit(text, int, int) from public;
grant execute on function public.rate_limit_hit(text, int, int) to authenticated;
