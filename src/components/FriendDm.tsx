'use client';
import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/hooks/useUser';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import {
  listDmThread,
  sendDm,
  fetchDmMessage,
  markDmThreadRead,
  DmMessage,
} from '@/lib/supabase/chat';
import ChatPanel, { ChatPanelMessage } from './ChatPanel';

interface Props {
  /** The friend we're DM-ing. */
  friendId: string;
  friendName: string;
  friendAvatarUrl: string | null;
  onClose: () => void;
}

function asPanelMessage(m: DmMessage): ChatPanelMessage {
  return {
    id: m.id,
    sender_id: m.sender_id,
    body: m.body,
    created_at: m.created_at,
    sender_name: m.sender?.display_name ?? null,
    sender_avatar: m.sender?.avatar_url ?? null,
  };
}

/** DM with one friend. Always open (caller renders it conditionally). */
export default function FriendDm({ friendId, friendName, friendAvatarUrl, onClose }: Props) {
  const { user } = useUser();
  const [messages, setMessages] = useState<DmMessage[]>([]);

  // Initial fetch + mark-as-read so the notification badge clears.
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    listDmThread({ meId: user.id, otherId: friendId })
      .then(msgs => { if (mounted) setMessages(msgs); })
      .catch(() => {});
    // Fire-and-forget — non-critical if it fails.
    markDmThreadRead({ meId: user.id, otherId: friendId }).catch(() => {});
    return () => { mounted = false; };
  }, [user, friendId]);

  // Realtime: append new messages in this thread.
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`dm:${user.id}:${friendId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dm_messages' },
        async (payload) => {
          const row = payload.new as { id: number; sender_id: string; recipient_id: string };
          const inThread =
            (row.sender_id === user.id && row.recipient_id === friendId) ||
            (row.sender_id === friendId && row.recipient_id === user.id);
          if (!inThread) return;
          const fresh = await fetchDmMessage(row.id);
          if (!fresh) return;
          setMessages(prev => prev.some(m => m.id === fresh.id) ? prev : [...prev, fresh]);
          // If they messaged us while the panel is open, mark immediately.
          if (row.sender_id === friendId) {
            markDmThreadRead({ meId: user.id, otherId: friendId }).catch(() => {});
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, friendId]);

  const handleSend = useCallback(async (body: string) => {
    if (!user) throw new Error('Sign in to chat.');
    await sendDm({ senderId: user.id, recipientId: friendId, body });
  }, [user, friendId]);

  if (!user) return null;

  // For DMs we want a more obvious header with the friend's avatar/name.
  // Build a custom title rendered through ChatPanel's title prop.
  const title = `💬 ${friendName}`;
  // Suppress unused — kept in props in case we later show their avatar in
  // the title bar.
  void friendAvatarUrl;

  return (
    <ChatPanel
      open
      onClose={onClose}
      title={title}
      emptyText={`Say hi to ${friendName} 👋`}
      messages={messages.map(asPanelMessage)}
      meId={user.id}
      onSend={handleSend}
    />
  );
}
