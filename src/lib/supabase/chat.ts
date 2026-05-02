'use client';
import { getSupabaseBrowser } from './client';

export interface ChatSender {
  id?: string; // present in raw rows; not in joined inline.
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface MatchMessage {
  id: number;
  game_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender?: ChatSender | null;
}

export interface DmMessage {
  id: number;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
  sender?: ChatSender | null;
}

const SENDER_JOIN = 'sender:profiles!{}_sender_id_fkey ( username, display_name, avatar_url )';

/** Latest 200 match messages, oldest-first. */
export async function listMatchMessages(gameId: string): Promise<MatchMessage[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('match_messages')
    .select(`
      id, game_id, sender_id, body, created_at,
      sender:profiles!match_messages_sender_id_fkey ( username, display_name, avatar_url )
    `)
    .eq('game_id', gameId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data as unknown as MatchMessage[]) ?? [];
}

export async function sendMatchMessage(opts: {
  gameId: string;
  senderId: string;
  body: string;
}): Promise<void> {
  const trimmed = opts.body.trim();
  if (!trimmed) return;
  if (trimmed.length > 500) throw new Error('Message too long.');
  const supabase = getSupabaseBrowser();
  const { error } = await supabase.from('match_messages').insert({
    game_id: opts.gameId,
    sender_id: opts.senderId,
    body: trimmed,
  });
  if (error) throw new Error(error.message);
}

/** Hydrate a single match message (used after a Realtime INSERT event so we
 *  can resolve the sender's profile for display). */
export async function fetchMatchMessage(id: number): Promise<MatchMessage | null> {
  const supabase = getSupabaseBrowser();
  const { data } = await supabase
    .from('match_messages')
    .select(`
      id, game_id, sender_id, body, created_at,
      sender:profiles!match_messages_sender_id_fkey ( username, display_name, avatar_url )
    `)
    .eq('id', id)
    .maybeSingle();
  return (data as unknown as MatchMessage | null) ?? null;
}

// ─── Direct messages ────────────────────────────────────────────────────

/** All messages in the thread between two users. */
export async function listDmThread(opts: {
  meId: string;
  otherId: string;
}): Promise<DmMessage[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('dm_messages')
    .select(`
      id, sender_id, recipient_id, body, created_at, read_at,
      sender:profiles!dm_messages_sender_id_fkey ( username, display_name, avatar_url )
    `)
    .or(
      `and(sender_id.eq.${opts.meId},recipient_id.eq.${opts.otherId}),` +
      `and(sender_id.eq.${opts.otherId},recipient_id.eq.${opts.meId})`,
    )
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data as unknown as DmMessage[]) ?? [];
}

export async function sendDm(opts: {
  senderId: string;
  recipientId: string;
  body: string;
}): Promise<void> {
  const trimmed = opts.body.trim();
  if (!trimmed) return;
  if (trimmed.length > 500) throw new Error('Message too long.');
  const supabase = getSupabaseBrowser();
  const { error } = await supabase.from('dm_messages').insert({
    sender_id: opts.senderId,
    recipient_id: opts.recipientId,
    body: trimmed,
  });
  if (error) {
    // Most common failure: not friends yet. Surface a friendlier message.
    if (error.code === '42501' || error.message.toLowerCase().includes('policy')) {
      throw new Error('You can only DM accepted friends.');
    }
    throw new Error(error.message);
  }
}

/** Mark every unread message FROM `otherId` TO `meId` as read.
 *  Idempotent — already-read rows are filtered out by the WHERE clause.
 *  RLS allows the recipient to update their own messages. */
export async function markDmThreadRead(opts: {
  meId: string;
  otherId: string;
}): Promise<void> {
  const supabase = getSupabaseBrowser();
  await supabase
    .from('dm_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', opts.meId)
    .eq('sender_id', opts.otherId)
    .is('read_at', null);
}

export async function fetchDmMessage(id: number): Promise<DmMessage | null> {
  const supabase = getSupabaseBrowser();
  const { data } = await supabase
    .from('dm_messages')
    .select(`
      id, sender_id, recipient_id, body, created_at, read_at,
      sender:profiles!dm_messages_sender_id_fkey ( username, display_name, avatar_url )
    `)
    .eq('id', id)
    .maybeSingle();
  return (data as unknown as DmMessage | null) ?? null;
}

// Suppress unused warning for SENDER_JOIN — kept for documentation, but
// the actual joins are inlined so they bind to the right table fk-name.
void SENDER_JOIN;
