-- ─── Joining a game (private or public) ─────────────────────────────────
-- Run AFTER 0001/0002/0003. Idempotent.
--
-- Why this exists
-- ---------------
-- The `games` RLS policies in 0001 say:
--   • SELECT: participants can read their games; anyone can read PUBLIC
--     waiting games; finished games are public.
--   • UPDATE: only participants can update.
--
-- This makes joining impossible for both private rooms (you can't even
-- see them by invite code) and public rooms (you can see them but you're
-- not a participant yet, so you can't UPDATE to set yourself as player2).
-- Loosening RLS would expose every private game's invite code.
--
-- Solution: two narrow SECURITY DEFINER functions that authenticate the
-- caller (auth.uid()) and perform exactly the lookup / join, bypassing RLS.

-- ─── 1) Look up a joinable room by its invite code ───────────────────────
create or replace function public.find_game_by_invite_code(code text)
returns setof public.games
language sql
security definer
set search_path = public
as $$
  select *
  from public.games
  where invite_code = upper(code)
    and status = 'waiting'
    and player2_id is null
  limit 1;
$$;

-- ─── 2) Atomically join the game as player 2 ────────────────────────────
create or replace function public.join_open_game(p_game_id uuid)
returns setof public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Must be authenticated to join.';
  end if;

  return query
  update public.games
     set player2_id = v_uid,
         status     = 'playing',
         started_at = coalesce(started_at, now())
  where id = p_game_id
    and status = 'waiting'
    and player2_id is null
    and player1_id is distinct from v_uid
  returning *;
end;
$$;

-- Lock down the functions and grant execute to authenticated users only.
revoke all on function public.find_game_by_invite_code(text) from public;
revoke all on function public.join_open_game(uuid)            from public;

grant execute on function public.find_game_by_invite_code(text) to authenticated;
grant execute on function public.join_open_game(uuid)            to authenticated;
