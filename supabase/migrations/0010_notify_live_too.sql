-- ─── "Your turn" notifications for LIVE games too ───────────────────────
-- Run AFTER 0001..0009. Idempotent.
--
-- Bug fix on 0008. The original trigger only emitted bell pings for
-- async (correspondence) games, on the (wrong) assumption that live
-- players would always see the opponent's move via Realtime. In
-- practice, plenty of "live" matches have one player walking away and
-- coming back later — and they got no signal at all that it's their
-- turn. The resume strip in the lobby would say "Your turn", but the
-- bell stayed empty.
--
-- Fix: drop the `mode <> 'async'` short-circuit so live + async both
-- ping. The match page's mark-as-read effect (markGameNotificationsRead)
-- still silences the bell the moment the player opens the match, so a
-- player who's actively sitting at the board never sees a flicker.
--
-- Plus: backfill notifications for every currently-awaiting live row so
-- existing in-progress games surface in the bell on next page load.

create or replace function public.notify_async_turn()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- (Removed: `if new.mode <> 'async' ...` — live games ping too now.)
  if new.status <> 'playing' then return new; end if;
  if new.awaiting_player_id is null then return new; end if;
  if tg_op = 'UPDATE'
     and old.awaiting_player_id is not distinct from new.awaiting_player_id then
    return new;
  end if;

  delete from public.notifications
   where user_id = new.awaiting_player_id
     and game_id = new.id
     and kind    = 'your_turn'
     and read_at is null;

  insert into public.notifications (user_id, kind, game_id, actor_id, payload)
  values (
    new.awaiting_player_id,
    'your_turn',
    new.id,
    case
      when new.awaiting_player_id = new.player1_id then new.player2_id
      else new.player1_id
    end,
    jsonb_build_object(
      'turn',         new.current_turn,
      'match_number', new.match_number
    )
  );

  return new;
end;
$$;

-- Backfill: every currently-awaited row gets a 'your_turn' bell entry,
-- unless one already exists. We deliberately don't touch read rows so
-- a player who already cleared their bell stays cleared.
insert into public.notifications (user_id, kind, game_id, actor_id, payload)
select g.awaiting_player_id,
       'your_turn',
       g.id,
       case when g.awaiting_player_id = g.player1_id then g.player2_id else g.player1_id end,
       jsonb_build_object('turn', g.current_turn, 'match_number', g.match_number)
  from public.games g
 where g.status = 'playing'
   and g.awaiting_player_id is not null
   and not exists (
     select 1
       from public.notifications n
      where n.user_id = g.awaiting_player_id
        and n.game_id = g.id
        and n.kind    = 'your_turn'
        and n.read_at is null
   );
