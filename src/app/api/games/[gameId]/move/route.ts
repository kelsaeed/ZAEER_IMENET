import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { applyOnlineAction, evaluateTimeoutClaim, type OnlineAction } from '@/game/onlineActions';
import { createInitialState } from '@/game/initialState';
import {
  checkRateLimit, classifyAction, type RateLimitConfig, type RateLimitResult,
} from '@/lib/server/rateLimit';
import type { GameState, Player, Orientation, Position } from '@/game/types';

// POST /api/games/[gameId]/move
//
// Server-authoritative game actions. The client sends only an *intent*;
// the server authenticates the user, confirms they're a participant whose
// turn it is, re-runs the pure engine to compute the next state, and
// persists ONLY the server-computed result (via the service role, which
// bypasses the column lockdown added in migration 0018). Clients can no
// longer write a board/winner directly.
//
// Body (discriminated on `action`):
//   { action:'move',      pieceId, to:{row,col}, rotateTo?, expectedTurn? }
//   { action:'endTurn',   pieceId, rotateTo?, expectedTurn? }
//   { action:'revertAnt', expectedTurn? }
//   { action:'timeout',   expectedTurn? }
//   { action:'resign' }
//   { action:'rematch',   expectedMatchNumber? }
//
// `expectedTurn` / `expectedMatchNumber` provide optimistic concurrency:
// the UPDATE is conditioned on the row still being where the client last
// saw it, so a stale or duplicated request fails safely with 409 instead
// of clobbering a newer state.

export const runtime = 'nodejs';

type GameRow = {
  id: string;
  player1_id: string | null;
  player2_id: string | null;
  status: string;
  state: GameState;
  winner_id: string | null;
  p1_ready: boolean;
  p2_ready: boolean;
  series_p1_wins: number;
  series_p2_wins: number;
  match_number: number;
};

function err(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

/** 429 with the contract the client/spec expect: a clear code, the seconds to
 *  wait, and a standard Retry-After header. Leaks nothing else. */
function rateLimited(retryAfter: number) {
  return NextResponse.json(
    { ok: false, error: 'rate_limited', retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}

/** Authoritative DB limiter hop. Fails open (returns null) on any error so a
 *  limiter/infra problem — or running before migration 0019 is applied —
 *  can never break a live game. */
async function dbRateLimit(
  supabase: ReturnType<typeof getSupabaseServer>,
  key: string,
  cfg: RateLimitConfig,
): Promise<RateLimitResult | null> {
  const { data, error } = await supabase.rpc('rate_limit_hit', {
    p_key: key,
    p_limit: cfg.limit,
    p_window_seconds: Math.round(cfg.windowMs / 1000),
  });
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { allowed: !!row.allowed, retryAfter: typeof row.retry_after === 'number' ? row.retry_after : 0 };
}

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const { gameId } = params;

  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err(401, 'unauthorized');

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return err(400, 'invalid JSON body');
  }
  const action = typeof body.action === 'string' ? body.action : null;

  // Rate limit before any DB load / engine work. Keyed by user + game + the
  // action's class so a busy match never throttles another, and malformed
  // payloads (classified 'bad') are throttled even though they 400 below.
  const rl = await checkRateLimit({
    userId: user.id,
    gameId,
    actionClass: classifyAction(action),
    dbHit: (key, cfg) => dbRateLimit(supabase, key, cfg),
  });
  if (!rl.allowed) return rateLimited(rl.retryAfter);

  if (!action) return err(400, 'missing action');

  // Load the canonical row (RLS lets a participant read it).
  const { data: gameRow, error: loadErr } = await supabase
    .from('games')
    .select('id, player1_id, player2_id, status, state, winner_id, p1_ready, p2_ready, series_p1_wins, series_p2_wins, match_number')
    .eq('id', gameId)
    .maybeSingle();
  if (loadErr) return err(500, 'failed to load game');
  if (!gameRow) return err(404, 'game not found');
  const game = gameRow as GameRow;

  // The caller must be one of the two players (spectators can't act).
  const myPlayer: Player | null =
    game.player1_id === user.id ? 1 :
    game.player2_id === user.id ? 2 :
    null;
  if (myPlayer === null) return err(403, 'you are not a participant in this game');

  const admin = getSupabaseAdmin();

  // ── resign ────────────────────────────────────────────────────────────
  if (action === 'resign') {
    if (game.status !== 'playing') return err(409, 'game is not in progress');
    const winnerNumber: Player = myPlayer === 1 ? 2 : 1;
    const winnerId = myPlayer === 1 ? game.player2_id : game.player1_id;
    const finalState: GameState = {
      ...game.state,
      phase: 'won',
      winner: winnerNumber,
      selectedPieceId: null,
      validMoves: [],
      canRotate: false,
      validRotations: [],
    };
    const { data, error } = await admin
      .from('games')
      .update({
        state: finalState,
        status: 'abandoned',
        winner_id: winnerId,
        finished_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .eq('status', 'playing')
      .select('state')
      .maybeSingle();
    if (error) return err(500, 'failed to persist resignation');
    if (!data) return err(409, 'game already finished');
    return NextResponse.json({ ok: true, state: (data as { state: GameState }).state });
  }

  // ── claimTimeout (opponent claims the win when the active player's clock
  //    has run out — the liveness path for a disconnected/frozen player) ────
  if (action === 'claimTimeout') {
    if (game.status !== 'playing') return err(409, 'game is not in progress');
    // Server-authoritative: the loser is always the active player
    // (state.currentPlayer) and expiry is computed from the canonical stored
    // clock against the server's own time — the claimant's clock is never
    // trusted. Either participant may claim; the outcome is identical.
    const outcome = evaluateTimeoutClaim(game.state, Date.now());
    if (!outcome.ok) return err(outcome.status, outcome.error);
    const finalState = outcome.state;
    const winnerId = finalState.winner === 1 ? game.player1_id : game.player2_id;
    const { data, error } = await admin
      .from('games')
      .update({
        state: finalState,
        current_turn: finalState.turn,
        status: 'finished',
        winner_id: winnerId,
        finished_at: new Date().toISOString(),
      })
      .eq('id', gameId)
      .eq('status', 'playing')
      .eq('current_turn', game.state.turn) // race guard: reject if a move landed first
      .select('state')
      .maybeSingle();
    if (error) return err(500, 'failed to persist timeout');
    // 0 rows → the active player moved (or the game ended) between our load
    // and write; their clock claim is moot. Tell the client to resync.
    if (!data) return err(409, 'game has advanced — please resync');
    return NextResponse.json({ ok: true, state: (data as { state: GameState }).state });
  }

  // ── rematch (reset the room once both players are ready) ────────────────
  if (action === 'rematch') {
    if (!game.p1_ready || !game.p2_ready) {
      return err(409, 'both players must be ready');
    }
    const won = game.winner_id;
    const p1Wins = won === game.player1_id ? game.series_p1_wins + 1 : game.series_p1_wins;
    const p2Wins = won === game.player2_id ? game.series_p2_wins + 1 : game.series_p2_wins;
    const fresh: GameState = {
      ...createInitialState(),
      phase: 'playing',
      lastAction: { key: 'action.player1Turn' },
    };
    let q = admin
      .from('games')
      .update({
        state: fresh,
        status: 'playing',
        winner_id: null,
        finished_at: null,
        current_turn: 0,
        p1_ready: false,
        p2_ready: false,
        series_p1_wins: p1Wins,
        series_p2_wins: p2Wins,
        match_number: game.match_number + 1,
      })
      .eq('id', gameId);
    if (typeof body.expectedMatchNumber === 'number') {
      q = q.eq('match_number', body.expectedMatchNumber);
    }
    const { data, error } = await q.select('state').maybeSingle();
    if (error) return err(500, 'failed to reset match');
    // 0 rows → the other client already reset it; that's fine, Realtime
    // will fan the canonical fresh state to both sides.
    return NextResponse.json({ ok: true, state: data ? (data as { state: GameState }).state : fresh });
  }

  // ── gameplay actions (move / endTurn / revertAnt / timeout) ─────────────
  const parsed = parseGameplayAction(action, body);
  if (!parsed) return err(400, 'invalid action payload');

  const outcome = applyOnlineAction(game.state, parsed, myPlayer);
  if (!outcome.ok) return err(outcome.status, outcome.error);

  const next = outcome.state;
  const isWon = next.phase === 'won' && next.winner != null;
  const winnerId = isWon ? (next.winner === 1 ? game.player1_id : game.player2_id) : null;

  let q = admin
    .from('games')
    .update({
      state: next,
      current_turn: next.turn,
      status: isWon ? 'finished' : 'playing',
      winner_id: winnerId,
      finished_at: isWon ? new Date().toISOString() : null,
    })
    .eq('id', gameId)
    .eq('status', 'playing'); // never mutate a finished/abandoned game
  if (typeof body.expectedTurn === 'number') {
    q = q.eq('current_turn', body.expectedTurn); // optimistic concurrency
  }
  const { data, error } = await q.select('state').maybeSingle();
  if (error) return err(500, 'failed to persist move');
  if (!data) return err(409, 'game has advanced — please resync');

  return NextResponse.json({ ok: true, state: (data as { state: GameState }).state });
}

/** Narrow the raw body into a typed gameplay OnlineAction, or null if the
 *  shape is wrong. Keeps the trusted engine boundary clean. */
function parseGameplayAction(action: string, body: Record<string, unknown>): OnlineAction | null {
  const rotateTo = isOrientation(body.rotateTo) ? body.rotateTo : undefined;
  switch (action) {
    case 'move': {
      if (typeof body.pieceId !== 'string') return null;
      const to = parsePosition(body.to);
      if (!to) return null;
      return { type: 'move', pieceId: body.pieceId, to, rotateTo };
    }
    case 'endTurn': {
      if (typeof body.pieceId !== 'string') return null;
      return { type: 'endTurn', pieceId: body.pieceId, rotateTo };
    }
    case 'revertAnt':
      return { type: 'revertAnt' };
    case 'timeout':
      return { type: 'timeout' };
    default:
      return null;
  }
}

function parsePosition(v: unknown): Position | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.row !== 'number' || typeof o.col !== 'number') return null;
  return { row: o.row, col: o.col };
}

function isOrientation(v: unknown): v is Orientation {
  return v === 'horizontal' || v === 'vertical' || v === 'diagonal' || v === 'antidiagonal';
}
