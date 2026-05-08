'use client';
import { getSupabaseBrowser } from './client';

/** Generic per-user notification kinds the bell can render. The DB
 *  schema is open (text column) so adding a kind here is a frontend
 *  concern. */
export type NotificationKind = 'your_turn' | 'new_puzzle';

export interface NotificationRow {
  id: number;
  user_id: string;
  kind: NotificationKind;
  game_id: string | null;
  actor_id: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface YourTurnNotification {
  id: number;
  gameId: string;
  createdAt: string;
  /** The opponent who just moved. */
  actor: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  matchNumber: number | null;
  turn: number | null;
}

/** Fetch all unread 'your_turn' pings for the caller, joined with the
 *  opponent's profile so the bell can render an avatar + display name. */
export async function listYourTurnNotifications(userId: string): Promise<YourTurnNotification[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('notifications')
    .select(`
      id, game_id, payload, created_at,
      actor:profiles!notifications_actor_id_fkey(id, username, display_name, avatar_url)
    `)
    .eq('user_id', userId)
    .eq('kind', 'your_turn')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !data) return [];

  type Row = {
    id: number;
    game_id: string | null;
    payload: { turn?: number; match_number?: number } | null;
    created_at: string;
    actor: { id: string; username: string; display_name: string; avatar_url: string | null } | null;
  };

  return (data as unknown as Row[])
    .filter(r => r.game_id !== null)
    .map(r => ({
      id: r.id,
      gameId: r.game_id as string,
      createdAt: r.created_at,
      actor: r.actor,
      matchNumber: r.payload?.match_number ?? null,
      turn: r.payload?.turn ?? null,
    }));
}

/** Mark every 'your_turn' ping for a given game as read. Called by the
 *  match page on mount so opening the game silences the bell entry. */
export async function markGameNotificationsRead(opts: { userId: string; gameId: string }): Promise<void> {
  const supabase = getSupabaseBrowser();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', opts.userId)
    .eq('game_id', opts.gameId)
    .is('read_at', null);
}

export interface NewPuzzleNotification {
  id: number;
  puzzleId: string;
  puzzleDate: string | null;
  titleEn: string | null;
  titleAr: string | null;
  difficulty: number | null;
  createdAt: string;
}

/** Fetch unread 'new_puzzle' pings for the caller. The trigger only
 *  inserts when the puzzle becomes live for today, so any unread row
 *  here means "today's puzzle is up and the player hasn't opened it
 *  yet". Returned newest-first; the bell typically renders just the
 *  newest because at most one puzzle goes live per day. */
export async function listNewPuzzleNotifications(userId: string): Promise<NewPuzzleNotification[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('notifications')
    .select('id, payload, created_at')
    .eq('user_id', userId)
    .eq('kind', 'new_puzzle')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error || !data) return [];
  type Row = {
    id: number;
    payload: {
      puzzle_id?: string;
      puzzle_date?: string | null;
      title_en?: string | null;
      title_ar?: string | null;
      difficulty?: number | null;
    } | null;
    created_at: string;
  };
  return (data as unknown as Row[])
    .filter(r => typeof r.payload?.puzzle_id === 'string')
    .map(r => ({
      id: r.id,
      puzzleId: r.payload!.puzzle_id as string,
      puzzleDate: r.payload?.puzzle_date ?? null,
      titleEn: r.payload?.title_en ?? null,
      titleAr: r.payload?.title_ar ?? null,
      difficulty: r.payload?.difficulty ?? null,
      createdAt: r.created_at,
    }));
}

/** Mark every unread 'new_puzzle' ping for the caller as read. Called
 *  by the daily puzzle page on mount so visiting the page silences the
 *  bell — same pattern as markGameNotificationsRead. */
export async function markNewPuzzleNotificationsRead(userId: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('kind', 'new_puzzle')
    .is('read_at', null);
}
