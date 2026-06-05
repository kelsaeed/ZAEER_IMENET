'use client';
import { getSupabaseBrowser } from './client';
import { getUnlocked, mergeUnlocked, type UnlockedMap } from '@/lib/achievements';

/** Two-way, best-effort sync of the local achievement set with the player's
 *  profile row. Pulls the remote map, merges it with the local one (earliest
 *  unlock date wins), writes the merge back if the local set added anything,
 *  and returns the merged result for display.
 *
 *  Degrades gracefully: if the `achievements` column doesn't exist yet (the
 *  0020 migration hasn't been applied) or any request fails, it just returns
 *  the local set — nothing throws, nothing breaks. */
export async function syncAchievements(userId: string): Promise<UnlockedMap> {
  const local = getUnlocked();
  try {
    const supabase = getSupabaseBrowser();
    const { data, error } = await supabase
      .from('profiles')
      .select('achievements')
      .eq('id', userId)
      .single();
    if (error) return local;

    const remote = (data?.achievements ?? {}) as UnlockedMap;
    const merged = mergeUnlocked(remote);

    // Only write back when the local device contributed something new.
    if (Object.keys(merged).length !== Object.keys(remote).length) {
      await supabase.from('profiles').update({ achievements: merged }).eq('id', userId);
    }
    return merged;
  } catch {
    return local;
  }
}

/** Read another player's unlocked achievements (for showing badges on their
 *  public profile). Returns an empty map if unavailable. */
export async function fetchAchievements(userId: string): Promise<UnlockedMap> {
  try {
    const supabase = getSupabaseBrowser();
    const { data, error } = await supabase
      .from('profiles')
      .select('achievements')
      .eq('id', userId)
      .single();
    if (error || !data) return {};
    return (data.achievements ?? {}) as UnlockedMap;
  } catch {
    return {};
  }
}
