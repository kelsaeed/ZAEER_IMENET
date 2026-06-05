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
 *  schema change is needed. */
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
