'use client';
import { getSupabaseBrowser } from './client';

/** Generic per-user notification kinds the bell can render. Today only
 *  'your_turn' is emitted by the DB; the field is kept open so future
 *  ping types (rematch offered, game resigned, …) slot in cleanly. */
export type NotificationKind = 'your_turn';

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
