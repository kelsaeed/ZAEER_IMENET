'use client';
import { getSupabaseBrowser } from './client';

export type FriendshipStatus = 'pending' | 'accepted';

export interface FriendProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  rating: number;
  // From the friendships row that joins to this user.
  friendshipId: number;
  status: FriendshipStatus;
  /** Did *I* send the request? */
  outgoing: boolean;
}

interface RawRow {
  id: number;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  // Joined profiles (one of these is "me", the other is "them").
  requester: { id: string; username: string; display_name: string; avatar_url: string | null; rating: number };
  addressee: { id: string; username: string; display_name: string; avatar_url: string | null; rating: number };
}

/** Find a profile by exact username (case-insensitive). Returns null if no
 *  match. Used by URL-based lookups (/u/<username>). */
export async function findProfileByUsername(username: string) {
  const supabase = getSupabaseBrowser();
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, rating, wins, losses, draws, bio, is_admin')
    .ilike('username', username.trim())
    .maybeSingle();
  return data;
}

/** Fuzzy search: returns up to 8 profiles whose username or display name
 *  contains the query (case-insensitive). Used by the friend-search box. */
export async function searchProfiles(query: string, excludeId?: string) {
  const q = query.trim().replace(/^@/, '');
  if (q.length < 2) return [];
  const supabase = getSupabaseBrowser();
  const pattern = `%${q.replace(/[%_]/g, '\\$&')}%`;
  let req = supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, rating')
    .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
    .order('username')
    .limit(8);
  if (excludeId) req = req.neq('id', excludeId);
  const { data } = await req;
  return data ?? [];
}

/** Send a friend request to `addresseeId`. Idempotent: if a row already
 *  exists in either direction it surfaces a friendly error. */
export async function sendFriendRequest(opts: {
  myId: string;
  addresseeId: string;
}): Promise<void> {
  if (opts.myId === opts.addresseeId) throw new Error("You can't add yourself.");
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: opts.myId, addressee_id: opts.addresseeId });
  if (error) {
    if (error.code === '23505') {
      throw new Error('Already requested or already friends.');
    }
    throw new Error(error.message);
  }
}

/** Accept an incoming request — only the addressee can accept. */
export async function acceptFriendRequest(friendshipId: number): Promise<void> {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId);
  if (error) throw new Error(error.message);
}

/** Decline / cancel / unfriend — works for both pending and accepted rows. */
export async function removeFriendship(friendshipId: number): Promise<void> {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) throw new Error(error.message);
}

/** List all friendships (both pending and accepted) involving the user.
 *  We resolve which side is "the friend" client-side. */
export async function listFriendships(myId: string): Promise<FriendProfile[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id, status, requester_id, addressee_id,
      requester:profiles!friendships_requester_id_fkey ( id, username, display_name, avatar_url, rating ),
      addressee:profiles!friendships_addressee_id_fkey ( id, username, display_name, avatar_url, rating )
    `)
    .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);

  return ((data as unknown as RawRow[]) ?? []).map(r => {
    const outgoing = r.requester_id === myId;
    const them = outgoing ? r.addressee : r.requester;
    return {
      id: them.id,
      username: them.username,
      display_name: them.display_name,
      avatar_url: them.avatar_url,
      rating: them.rating,
      friendshipId: r.id,
      status: r.status,
      outgoing,
    };
  });
}
