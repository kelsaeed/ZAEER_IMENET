'use client';
import type { GameState, Player, TimeControl, Orientation, Position } from '@/game/types';
import { createInitialState } from '@/game/initialState';
import { timeControlsMatch } from '@/game/timeControl';
import { getSupabaseBrowser } from './client';

export type GameStatus = 'waiting' | 'playing' | 'finished' | 'abandoned';
export type GameMode   = 'live' | 'async';

export interface GameRow {
  id: string;
  player1_id: string | null;
  player2_id: string | null;
  status: GameStatus;
  /** 'live' — sit-down realtime match. 'async' — correspondence; opponent
   *  gets a notification when it's their turn and can come back later. */
  mode: GameMode;
  winner_id: string | null;
  state: GameState;
  current_turn: number;
  is_public: boolean;
  invite_code: string | null;
  /** Set by the DB trigger whenever the turn counter advances. */
  last_move_at: string | null;
  /** Player whose turn it is (mirror of state.currentPlayer, set by trigger). */
  awaiting_player_id: string | null;
  /** Time control for the match. Async games are constrained to {kind:'none'}
   *  by a DB check — see migration 0009. */
  time_control: TimeControl;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  // Rematch state — both players toggle ready, host writes fresh match.
  p1_ready: boolean;
  p2_ready: boolean;
  series_p1_wins: number;
  series_p2_wins: number;
  match_number: number;
}

/** Short, human-friendly invite code: 6 alpha-num chars, no ambiguous letters. */
export function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // skip I, O, 0, 1
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/** Create a new online game. Caller becomes player 1. Defaults to a live
 *  untimed match; pass `mode: 'async'` for correspondence and/or a
 *  `timeControl` to attach a chess clock. Async games are forced to
 *  untimed (DB constraint will reject anything else). */
export async function createOnlineGame(opts: {
  userId: string;
  isPublic: boolean;
  mode?: GameMode;
  timeControl?: TimeControl;
}): Promise<GameRow> {
  const supabase = getSupabaseBrowser();
  const mode: GameMode = opts.mode ?? 'live';
  const timeControl: TimeControl = mode === 'async'
    ? { kind: 'none' }
    : (opts.timeControl ?? { kind: 'none' });
  // Build a clean playing state — phase 'playing', currentPlayer 1, fresh pieces.
  const initial: GameState = {
    ...createInitialState({ timeControl }),
    phase: 'playing',
    lastAction: { key: 'action.player1Turn' },
  };
  const { data, error } = await supabase
    .from('games')
    .insert({
      player1_id: opts.userId,
      status: 'waiting',
      state: initial,
      current_turn: 0,
      is_public: opts.isPublic,
      mode,
      time_control: timeControl,
      invite_code: generateInviteCode(),
    })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create game');
  return data as GameRow;
}

/** Join a game as player 2. Calls the join_open_game RPC (security definer)
 *  which atomically updates the row server-side and bypasses the
 *  participants-only RLS UPDATE policy. */
export async function joinOnlineGame(opts: {
  userId: string;
  gameId: string;
}): Promise<GameRow> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.rpc('join_open_game', { p_game_id: opts.gameId });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Could not join — already taken or finished?');
  }
  return data[0] as GameRow;
}

/** Look up a game by its invite code, including private rooms. Calls the
 *  find_game_by_invite_code RPC so the lookup works for the joiner who
 *  isn't yet a participant (and therefore cannot read the row directly). */
export async function findGameByInviteCode(code: string): Promise<GameRow | null> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .rpc('find_game_by_invite_code', { code: code.toUpperCase() });
  if (error) return null;
  return Array.isArray(data) && data.length > 0 ? (data[0] as GameRow) : null;
}

/** A move *intent* submitted to the server-authoritative endpoint. The
 *  client never sends a full board — only what it wants to do. The server
 *  re-runs the engine and persists the result (see
 *  src/app/api/games/[gameId]/move/route.ts). This is what replaced the old
 *  client-trusted `saveGameState` write, closing the cheat path where any
 *  participant could PUT an arbitrary winning state. */
export type GameActionBody =
  | { action: 'move'; pieceId: string; to: Position; rotateTo?: Orientation; expectedTurn: number }
  | { action: 'endTurn'; pieceId: string; rotateTo?: Orientation; expectedTurn: number }
  | { action: 'revertAnt'; expectedTurn: number }
  | { action: 'timeout'; expectedTurn: number }
  | { action: 'claimTimeout' }
  | { action: 'resign' }
  | { action: 'rematch'; expectedMatchNumber: number };

export type GameActionResult =
  | { ok: true; state: GameState }
  | { ok: false; status: number; error: string };

/** POST a game action to the server route. Auth travels via the session
 *  cookie (same-origin fetch). On success the server returns the canonical
 *  next state; Realtime will also fan that same state to both players. */
export async function submitGameAction(gameId: string, body: GameActionBody): Promise<GameActionResult> {
  try {
    const res = await fetch(`/api/games/${gameId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let json: { state?: GameState; error?: string } = {};
    try { json = await res.json(); } catch { /* empty body */ }
    if (!res.ok || !json.state) {
      return { ok: false, status: res.status, error: json.error ?? `request failed (${res.status})` };
    }
    return { ok: true, state: json.state };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'network error' };
  }
}

/** Quick Match: try to join the oldest open public game with the SAME
 *  mode + time control, or create one. We never silently drop a player
 *  into a different ruleset (a Blitz seeker landing in a Bullet room
 *  would be miserable), so the search is fully filtered. */
export async function quickMatch(opts: {
  userId: string;
  mode?: GameMode;
  timeControl?: TimeControl;
}): Promise<{ gameId: string; created: boolean }> {
  const supabase = getSupabaseBrowser();
  const mode: GameMode = opts.mode ?? 'live';
  const timeControl: TimeControl = mode === 'async'
    ? { kind: 'none' }
    : (opts.timeControl ?? { kind: 'none' });

  // First fetch all candidate rooms (mode + open). We then filter by
  // exact time control client-side because Postgres jsonb equality is
  // sensitive to key ordering and the client is small enough that the
  // extra hop doesn't matter.
  const { data: open, error: searchError } = await supabase
    .from('games')
    .select('id, time_control')
    .eq('status', 'waiting')
    .eq('is_public', true)
    .eq('mode', mode)
    .neq('player1_id', opts.userId)
    .is('player2_id', null)
    .order('created_at', { ascending: true })
    .limit(20);
  if (searchError) throw new Error(searchError.message);

  const candidates = (open ?? []).filter(r =>
    timeControlsMatch((r as { time_control: TimeControl }).time_control ?? { kind: 'none' }, timeControl)
  );

  for (const c of candidates) {
    try {
      await joinOnlineGame({ userId: opts.userId, gameId: c.id });
      return { gameId: c.id, created: false };
    } catch {
      // Lost a race; try the next one.
    }
  }

  const newGame = await createOnlineGame({ userId: opts.userId, isPublic: true, mode, timeControl });
  return { gameId: newGame.id, created: true };
}

/** List open async rooms anyone can join. Powers the "Correspondence
 *  games" lobby panel — you grab one, play your move, and walk away.
 *  Returns oldest first so rooms don't sit forever waiting for a joiner. */
export interface AsyncOpenRoom {
  id: string;
  created_at: string;
  time_control: TimeControl;   // always {kind:'none'} for async, but kept for shape parity
  player1: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    rating: number;
  } | null;
}
export async function listAsyncOpenRooms(opts: { userId: string; limit?: number }): Promise<AsyncOpenRoom[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('games')
    .select(`
      id, created_at, time_control,
      player1:profiles!games_player1_id_fkey(id, username, display_name, avatar_url, rating)
    `)
    .eq('status', 'waiting')
    .eq('is_public', true)
    .eq('mode', 'async')
    .neq('player1_id', opts.userId)
    .is('player2_id', null)
    .order('created_at', { ascending: true })
    .limit(opts.limit ?? 20);
  if (error || !data) return [];
  return data as unknown as AsyncOpenRoom[];
}

export interface ActiveGame {
  id: string;
  status: GameStatus;
  mode: GameMode;
  time_control: TimeControl;
  current_turn: number;
  is_public: boolean;
  invite_code: string | null;
  updated_at: string;
  /** When the last move was played; null if nobody has moved yet. */
  last_move_at: string | null;
  /** True if it's the caller's turn to play. */
  myTurn: boolean;
  /** Side the caller is on (so the lobby can colour the chip). */
  myPlayer: Player;
  opponent: {
    id: string | null;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

/** Games where the caller is currently playing — used by the lobby to offer
 *  "Resume" tiles so a player who navigated away can jump straight back in.
 *
 *  We deliberately exclude `waiting` rooms here. Those are open invites
 *  with no opponent yet, and a stale waiting room from days ago looked
 *  identical to a "real" resumeable game in the panel — clicking it took
 *  the player into an empty waiting screen, which felt like "a brand new
 *  game with a brand new code". Only matches that have actually started
 *  show up. */
export async function listMyActiveGames(userId: string): Promise<ActiveGame[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('games')
    .select(`
      id, status, mode, time_control, current_turn, is_public, invite_code, updated_at, last_move_at,
      player1_id, player2_id, state,
      p1:profiles!games_player1_id_fkey(id, username, display_name, avatar_url),
      p2:profiles!games_player2_id_fkey(id, username, display_name, avatar_url)
    `)
    .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    .eq('status', 'playing')
    .order('updated_at', { ascending: false });
  if (error || !data) return [];

  type Row = {
    id: string;
    status: GameStatus;
    mode: GameMode;
    time_control: TimeControl | null;
    current_turn: number;
    is_public: boolean;
    invite_code: string | null;
    updated_at: string;
    last_move_at: string | null;
    player1_id: string | null;
    player2_id: string | null;
    state: GameState | null;
    p1: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
    p2: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
  };

  return (data as unknown as Row[]).map(r => {
    const myPlayer: Player = r.player1_id === userId ? 1 : 2;
    const opp = myPlayer === 1 ? r.p2 : r.p1;
    const myTurn = r.status === 'playing' && r.state?.currentPlayer === myPlayer;
    return {
      id: r.id,
      status: r.status,
      mode: r.mode ?? 'live',
      time_control: r.time_control ?? { kind: 'none' },
      current_turn: r.current_turn,
      is_public: r.is_public,
      invite_code: r.invite_code,
      updated_at: r.updated_at,
      last_move_at: r.last_move_at,
      myTurn,
      myPlayer,
      opponent: opp,
    };
  });
}

// (resignGame removed: resignation is now an authoritative server action —
//  see submitGameAction({ action: 'resign' }). A direct client write to
//  status/winner_id would also be rejected by the column lockdown in
//  migration 0018.)
