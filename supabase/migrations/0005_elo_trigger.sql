-- ─── ELO + win/loss counter trigger ──────────────────────────────────────
-- Run AFTER 0001/0002/0003/0004. Idempotent.
--
-- When a game's status flips into a final state ('finished' or 'abandoned')
-- and a winner_id is set, this trigger:
--   • Increments the winner's wins, the loser's losses.
--   • Adjusts ratings using a standard ELO formula (K=32).
-- Floors rating at 100 so a long losing streak can't overflow into negative.
-- Skips silently when winner_id or one of the player_ids is null
-- (e.g. game was abandoned before player2 joined).

create or replace function public.handle_game_finish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k       constant int := 32;
  rating_floor constant int := 100;
  win_id  uuid;
  los_id  uuid;
  win_rating int;
  los_rating int;
  expected_winner numeric;
  delta   int;
begin
  -- Only react to a transition INTO a final state.
  if old.status = new.status then return new; end if;
  if new.status not in ('finished', 'abandoned') then return new; end if;
  if new.winner_id is null then return new; end if;
  if new.player1_id is null or new.player2_id is null then return new; end if;

  win_id := new.winner_id;
  los_id := case when win_id = new.player1_id then new.player2_id else new.player1_id end;

  select rating into win_rating from public.profiles where id = win_id;
  select rating into los_rating from public.profiles where id = los_id;
  if win_rating is null or los_rating is null then return new; end if;

  expected_winner := 1.0 / (1.0 + power(10.0, (los_rating - win_rating) / 400.0));
  delta := round(k * (1 - expected_winner));

  update public.profiles
     set wins   = wins + 1,
         rating = greatest(rating_floor, rating + delta)
   where id = win_id;

  update public.profiles
     set losses = losses + 1,
         rating = greatest(rating_floor, rating - delta)
   where id = los_id;

  return new;
end;
$$;

drop trigger if exists on_game_finish on public.games;
create trigger on_game_finish
  after update of status on public.games
  for each row
  execute function public.handle_game_finish();
