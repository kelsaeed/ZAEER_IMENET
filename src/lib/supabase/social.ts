'use client';
import { getSupabaseBrowser } from './client';

// Backed by the `user_blocks` and `chat_mutes` tables in migration 0007 and
// the existing `games` table for head-to-head stats. All inserts/deletes go
// through RLS — we never need a service-role client for these.

// ─── Blocks ─────────────────────────────────────────────────────────────────

/** True if `me` has blocked `them`. */
export async function isBlockedByMe(myId: string, themId: string): Promise<boolean> {
  const supabase = getSupabaseBrowser();
  const { data } = await supabase
    .from('user_blocks')
    .select('blocker_id')
    .eq('blocker_id', myId)
    .eq('blocked_id', themId)
    .maybeSingle();
  return !!data;
}

export async function blockUser(myId: string, themId: string): Promise<void> {
  if (myId === themId) throw new Error("You can't block yourself.");
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from('user_blocks')
    .insert({ blocker_id: myId, blocked_id: themId });
  // 23505 = unique violation → already blocked, treat as no-op.
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function unblockUser(myId: string, themId: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', myId)
    .eq('blocked_id', themId);
  if (error) throw new Error(error.message);
}

// ─── Chat mutes ─────────────────────────────────────────────────────────────

export async function isMutedByMe(myId: string, themId: string): Promise<boolean> {
  const supabase = getSupabaseBrowser();
  const { data } = await supabase
    .from('chat_mutes')
    .select('muter_id')
    .eq('muter_id', myId)
    .eq('muted_id', themId)
    .maybeSingle();
  return !!data;
}

export async function muteUserChat(myId: string, themId: string): Promise<void> {
  if (myId === themId) throw new Error("You can't mute yourself.");
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from('chat_mutes')
    .insert({ muter_id: myId, muted_id: themId });
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function unmuteUserChat(myId: string, themId: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from('chat_mutes')
    .delete()
    .eq('muter_id', myId)
    .eq('muted_id', themId);
  if (error) throw new Error(error.message);
}

/** Returns the set of user ids the current user has muted. Used by the chat
 *  panel to filter incoming messages. Cheap — at most a handful of rows. */
export async function listMutedIds(myId: string): Promise<Set<string>> {
  const supabase = getSupabaseBrowser();
  const { data } = await supabase
    .from('chat_mutes')
    .select('muted_id')
    .eq('muter_id', myId);
  return new Set((data ?? []).map(r => r.muted_id as string));
}

// ─── Head-to-head ───────────────────────────────────────────────────────────

export interface HeadToHead {
  myWins: number;
  theirWins: number;
  draws: number;
  total: number;
}

/** Count finished games between `me` and `them`, broken down by who won.
 *  Draws = finished games with no winner_id. We don't paginate — two
 *  players' shared history is short enough to fetch in one round trip. */
export async function getHeadToHead(myId: string, themId: string): Promise<HeadToHead> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('games')
    .select('player1_id, player2_id, winner_id, status')
    .or(
      // Two ways to pair us — order doesn't matter since either side could
      // have been player1 in any given match.
      `and(player1_id.eq.${myId},player2_id.eq.${themId}),`
      + `and(player1_id.eq.${themId},player2_id.eq.${myId})`,
    )
    .in('status', ['finished', 'abandoned']);
  if (error) {
    // Permissions / network. Surface zeroes so the UI can still render.
    return { myWins: 0, theirWins: 0, draws: 0, total: 0 };
  }
  let myWins = 0, theirWins = 0, draws = 0;
  for (const row of data ?? []) {
    if (row.winner_id === myId) myWins++;
    else if (row.winner_id === themId) theirWins++;
    else draws++;
  }
  return { myWins, theirWins, draws, total: (data ?? []).length };
}

// ─── Friend status helper ───────────────────────────────────────────────────
// Wrapper around `listFriendships` that returns just the relevant slice for
// one target user, so the menu doesn't need to re-import the full friends
// helper.
import { listFriendships, type FriendProfile } from './friends';

export type FriendBadgeStatus = 'none' | 'pending-out' | 'pending-in' | 'friends';

export async function getFriendStatus(myId: string, themId: string): Promise<{
  status: FriendBadgeStatus;
  friendshipId: number | null;
}> {
  const list: FriendProfile[] = await listFriendships(myId);
  const match = list.find(f => f.id === themId);
  if (!match) return { status: 'none', friendshipId: null };
  if (match.status === 'accepted') return { status: 'friends', friendshipId: match.friendshipId };
  return {
    status: match.outgoing ? 'pending-out' : 'pending-in',
    friendshipId: match.friendshipId,
  };
}
