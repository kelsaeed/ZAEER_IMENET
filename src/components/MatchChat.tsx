'use client';
import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import {
  listMatchMessages,
  sendMatchMessage,
  fetchMatchMessage,
  MatchMessage,
} from '@/lib/supabase/chat';
import ChatPanel, { ChatPanelMessage } from './ChatPanel';

interface Props {
  gameId: string;
  /** Pixel offset from the top so the panel doesn't cover the player ribbon. */
  topInset?: number;
  /** True if the local user is just spectating. */
  spectator?: boolean;
}

function asPanelMessage(m: MatchMessage): ChatPanelMessage {
  return {
    id: m.id,
    sender_id: m.sender_id,
    body: m.body,
    created_at: m.created_at,
    sender_name: m.sender?.display_name ?? null,
    sender_avatar: m.sender?.avatar_url ?? null,
  };
}

/** In-game chat. Floating button (bottom-right) with unread badge,
 *  expanding into the full ChatPanel. */
export default function MatchChat({ gameId, topInset = 70, spectator }: Props) {
  const { user } = useUser();
  const { theme } = useSettings();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<MatchMessage[]>([]);
  const [unread, setUnread] = useState(0);

  // Initial load.
  useEffect(() => {
    if (!gameId) return;
    let mounted = true;
    listMatchMessages(gameId)
      .then(msgs => { if (mounted) setMessages(msgs); })
      .catch(() => { /* silent — chat is non-critical */ });
    return () => { mounted = false; };
  }, [gameId]);

  // Realtime: append new INSERTs (fetching to resolve sender profile).
  useEffect(() => {
    if (!gameId) return;
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`match-chat:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_messages',
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          const id = (payload.new as { id: number }).id;
          const senderId = (payload.new as { sender_id: string }).sender_id;
          const fresh = await fetchMatchMessage(id);
          if (!fresh) return;
          setMessages(prev => {
            // Dedupe: skip if we already have this message id (e.g. from
            // the initial fetch that includes our own send).
            if (prev.some(m => m.id === fresh.id)) return prev;
            return [...prev, fresh];
          });
          if (!open && senderId !== user?.id) {
            setUnread(u => u + 1);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [gameId, user?.id, open]);

  // Reset unread count whenever the panel opens.
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  const handleSend = useCallback(async (body: string) => {
    if (!user) throw new Error('Sign in to chat.');
    await sendMatchMessage({ gameId, senderId: user.id, body });
  }, [gameId, user]);

  if (!user) return null;

  return (
    <>
      {/* Floating launcher (bottom-right). Hidden while the panel is open
          on small screens to avoid stacking above the input field. */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-4 right-4 z-30 rounded-full w-14 h-14 flex items-center justify-center text-2xl shadow-lg transition-transform hover:scale-110"
        style={{
          background: theme.panelBg,
          border: `2px solid ${theme.p1AccentBorder}`,
          color: theme.p1Color,
          opacity: open ? 0.4 : 1,
        }}
        aria-label="Toggle chat"
      >
        💬
        {unread > 0 && !open && (
          <span
            className="absolute -top-1 -right-1 rounded-full text-xs font-bold text-white px-1.5 py-0.5 min-w-[20px] text-center"
            style={{ background: '#ef4444' }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <ChatPanel
        open={open}
        onClose={() => setOpen(false)}
        title="💬 Match chat"
        emptyText="Be the first to say hi 👋"
        messages={messages.map(asPanelMessage)}
        meId={user.id}
        onSend={handleSend}
        topInset={topInset}
        readOnly={spectator}
        readOnlyHint="Spectators can read but not send."
      />
    </>
  );
}
