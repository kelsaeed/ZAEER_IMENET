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

/** Join a game as player 2. Game must be in 'waiting' status with no player2 yet. */
export async function joinOnlineGame(opts: {
  userId: string;
  gameId: string;
}): Promise<GameRow> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('games')
    .update({
      player2_id: opts.userId,
      status: 'playing',
      started_at: new Date().toISOString(),
    })
    .eq('id', opts.gameId)
    .eq('status', 'waiting')
    .is('player2_id', null)
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not join — already taken or finished?');
  return data as GameRow;
}

/** Look up a game by its invite code (for the "Join with code" flow). */
export async function findGameByInviteCode(code: string): Promise<GameRow | null> {
  const supabase = getSupabaseBrowser();
  const { data } = await supabase
    .from('games')
    .select('*')
    .eq('invite_code', code.toUpperCase())
    .maybeSingle();
  return (data as GameRow | null) ?? null;
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
