'use client';
import type { GameState, Player } from '@/game/types';
import { createInitialState } from '@/game/initialState';
import { getSupabaseBrowser } from './client';

export type GameStatus = 'waiting' | 'playing' | 'finished' | 'abandoned';

export interface GameRow {
  id: string;
  player1_id: string | null;
  player2_id: string | null;
  status: GameStatus;
  winner_id: string | null;
  state: GameState;
  current_turn: number;
  is_public: boolean;
  invite_code: string | null;
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

/** Create a new online game. Caller becomes player 1. */
export async function createOnlineGame(opts: {
  userId: string;
  isPublic: boolean;
}): Promise<GameRow> {
  const supabase = getSupabaseBrowser();
  // Build a clean playing state — phase 'playing', currentPlayer 1, fresh pieces.
  const initial: GameState = {
    ...createInitialState(),
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

/** Persist a move/state change. The caller pre-computes the new GameState
 *  via applyMove() locally; this just writes the result back. */
export async function saveGameState(opts: {
  gameId: string;
  state: GameState;
  player1Id: string | null;
  player2Id: string | null;
}): Promise<void> {
  const supabase = getSupabaseBrowser();
  const isWon = opts.state.phase === 'won' && opts.state.winner;
  const winnerId = isWon
    ? (opts.state.winner === 1 ? opts.player1Id : opts.player2Id)
    : null;
  const { error } = await supabase
    .from('games')
    .update({
      state: opts.state,
      current_turn: opts.state.turn,
      status: isWon ? 'finished' : 'playing',
      winner_id: winnerId,
      finished_at: isWon ? new Date().toISOString() : null,
    })
    .eq('id', opts.gameId);
  if (error) throw new Error(error.message);
}

/** Quick Match: try to join the oldest open public game, or create one.
 *  This is the "matchmaking" entry point — the user just gets routed to
 *  a playable room as fast as possible. */
export async function quickMatch(opts: { userId: string }): Promise<{ gameId: string; created: boolean }> {
  const supabase = getSupabaseBrowser();

  // 1. Find an open public game we didn't create.
  const { data: open, error: searchError } = await supabase
    .from('games')
    .select('id')
    .eq('status', 'waiting')
    .eq('is_public', true)
    .neq('player1_id', opts.userId)
    .is('player2_id', null)
    .order('created_at', { ascending: true })
    .limit(1);
  if (searchError) throw new Error(searchError.message);

  if (open && open.length > 0) {
    const target = open[0].id;
    try {
      await joinOnlineGame({ userId: opts.userId, gameId: target });
      return { gameId: target, created: false };
    } catch {
      // Lost a race against another joiner — fall through and create one.
    }
  }

  // 2. None available (or join lost a race) — create a public game.
  const newGame = await createOnlineGame({ userId: opts.userId, isPublic: true });
  return { gameId: newGame.id, created: true };
}

/** Player gives up — game ends with the other player as winner. */
export async function resignGame(opts: {
  gameId: string;
  losingPlayer: Player;
  player1Id: string | null;
  player2Id: string | null;
}): Promise<void> {
  const supabase = getSupabaseBrowser();
  const winnerId = opts.losingPlayer === 1 ? opts.player2Id : opts.player1Id;
  const { error } = await supabase
    .from('games')
    .update({
      status: 'abandoned',
      winner_id: winnerId,
      finished_at: new Date().toISOString(),
    })
    .eq('id', opts.gameId);
  if (error) throw new Error(error.message);
}
