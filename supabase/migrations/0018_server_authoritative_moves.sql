-- ─── Server-authoritative online moves ──────────────────────────────────
-- Run AFTER 0001..0017. Idempotent.
--
-- Why this exists
-- ---------------
-- Until now the `games` UPDATE policy (0001) only checked PARTICIPATION,
-- so either player's browser could write an arbitrary `state` / `winner_id`
-- / `status` straight to the row — teleport pieces, force a win, and move
-- their ELO. The new /api/games/[gameId]/move route re-runs the real game
-- engine on the server and writes the result with the SERVICE ROLE.
--
-- This migration removes the client's ability to write the authoritative
-- columns at all. Column-level UPDATE privileges are the lever:
--   • Revoke the blanket UPDATE that Supabase grants by default.
--   • Re-grant UPDATE on ONLY the rematch ready flags, which are harmless
--     (they can't change the board or the result) and are still written
--     directly by the client's toggleReady.
--
-- Everything else (moves, end-turn, revert, resign, timeout, rematch reset)
-- now flows through the server route. The service role bypasses these
-- grants, and the SECURITY DEFINER join/lookup functions (0004) run as the
-- table owner, so joining a game is unaffected. The row-level UPDATE policy
-- from 0001 still applies on top of the column grant.

revoke update on public.games from anon;
revoke update on public.games from authenticated;

-- The only columns a normal client may still write directly. A client
-- UPDATE that touches any other column now fails with "permission denied
-- for column", which is exactly what blocks the old cheat path.
grant update (p1_ready, p2_ready) on public.games to authenticated;
