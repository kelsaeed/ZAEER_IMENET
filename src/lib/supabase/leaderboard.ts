'use client';
import { getSupabaseBrowser } from './client';

export interface LeaderboardRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

/** Top players by rating. Limited to profiles that have finished at least one
 *  ranked game so the board isn't flooded with brand-new default-1000 accounts.
 *  Profiles are publicly readable (RLS policy "profiles read all"), so no
 *  schema change is needed.
 *
 *  No longer used by the leaderboard page (which is now friends-only — see
 *  listFriendsLeaderboard) but kept for any caller that wants a global board. */
export async function listTopPlayers(limit = 50): Promise<LeaderboardRow[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, rating, wins, losses, draws')
    .or('wins.gt.0,losses.gt.0,draws.gt.0')
    .order('rating', { ascending: false })
    .order('wins', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as LeaderboardRow[];
}

/** A private, friends-only leaderboard: the player and their accepted friends,
 *  ranked by rating. Each person only ever sees their own circle — nobody is
 *  exposed to the whole user base. The caller's own row is always included so
 *  they can see where they place among friends, even with zero games played. */
export async function listFriendsLeaderboard(myId: string): Promise<LeaderboardRow[]> {
  const supabase = getSupabaseBrowser();

  // 1. Accepted friendships I'm part of (RLS already scopes these to me).
  const { data: fr, error: frErr } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`);
  if (frErr) throw frErr;

  const ids = new Set<string>([myId]);
  for (const row of (fr ?? []) as { requester_id: string; addressee_id: string }[]) {
    ids.add(row.requester_id === myId ? row.addressee_id : row.requester_id);
  }

  // 2. Resolve those profiles and rank them. No min-games filter here: a
  //    friend circle is small, and you want to see everyone in it.
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, rating, wins, losses, draws')
    .in('id', Array.from(ids))
    .order('rating', { ascending: false })
    .order('wins', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LeaderboardRow[];
}
