'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import {
  listMatchMessages,
  sendMatchMessage,
  fetchMatchMessage,
  MatchMessage,
} from '@/lib/supabase/chat';
import { listMutedIds } from '@/lib/supabase/social';
import { useMatchReactions } from '@/hooks/useMatchReactions';
import ChatPanel, { ChatPanelMessage } from './ChatPanel';
import FlyingEmojiOverlay from './FlyingEmojiOverlay';

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
  const { theme, isRTL } = useSettings();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<MatchMessage[]>([]);
  const [unread, setUnread] = useState(0);
  // Set of user ids the local user has muted. The chat itself isn't filtered
  // server-side (the senders shouldn't be told they're muted) — we just hide
  // their messages from the local panel and don't bump the unread badge.
  const [mutedIds, setMutedIds] = useState<Set<string>>(() => new Set());

  // Initial load.
  useEffect(() => {
    if (!gameId) return;
    let mounted = true;
    listMatchMessages(gameId)
      .then(msgs => { if (mounted) setMessages(msgs); })
      .catch(() => { /* silent — chat is non-critical */ });
    return () => { mounted = false; };
  }, [gameId]);

  // Pull the local user's mute list ONLY when the chat panel actually
  // opens. Previous version fired on mount, which paid a network
  // round-trip on every match page load even for users who never tap
  // the chat icon — and on a project that hasn't applied migration
  // 0007 yet, that round-trip fails with a 404 every match. Mute
  // filtering on incoming-message notifications is a tiny edge case
  // not worth the eager fetch; we accept that the unread badge may
  // briefly include muted senders' messages until the user opens
  // the panel for the first time.
  useEffect(() => {
    if (!user) return;
    if (!open) return;
    let mounted = true;
    listMutedIds(user.id)
      .then(ids => { if (mounted) setMutedIds(ids); })
      .catch(() => { /* social tables may not be migrated yet */ });
    return () => { mounted = false; };
  }, [user, open]);

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
          if (!open && senderId !== user?.id && !mutedIds.has(senderId)) {
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

  // Ephemeral emoji reactions — broadcast over Realtime, never persisted.
  // The overlay renders fullscreen regardless of chat-open state so a
  // received reaction always lands even if the recipient never opens
  // the panel.
  const reactions = useMatchReactions({
    gameId,
    meId: user?.id ?? null,
    readOnly: !!spectator,
  });

  // Filter out muted senders from the panel view.
  const visibleMessages = useMemo(
    () => messages.filter(m => !mutedIds.has(m.sender_id)),
    [messages, mutedIds],
  );

  if (!user) return null;

  return (
    <>
      {/* Floating launcher — flips to bottom-left in RTL so it mirrors the
          reading direction (and so it doesn't end up trapped under the
          Resign button on the same side). Hidden visually while the panel
          is open to keep the input from stacking under it. */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-4 z-30 rounded-full w-14 h-14 flex items-center justify-center text-2xl shadow-lg transition-transform hover:scale-110"
        style={{
          [isRTL ? 'left' : 'right']: 16,
          background: theme.panelBg,
          border: `2px solid ${theme.p1AccentBorder}`,
          color: theme.p1Color,
          opacity: open ? 0.4 : 1,
        } as React.CSSProperties}
        aria-label="Toggle chat"
      >
        💬
        {unread > 0 && !open && (
          <span
            className="absolute -top-1 rounded-full text-xs font-bold text-white px-1.5 py-0.5 min-w-[20px] text-center"
            style={{
              [isRTL ? 'left' : 'right']: -4,
              background: '#ef4444',
            } as React.CSSProperties}
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
        messages={visibleMessages.map(asPanelMessage)}
        meId={user.id}
        onSend={handleSend}
        topInset={topInset}
        readOnly={spectator}
        readOnlyHint="Spectators can read but not send."
        onReact={spectator ? undefined : reactions.sendReaction}
        reactionsMuted={reactions.muted}
        setReactionsMuted={reactions.setMuted}
      />

      {/* Always-on overlay — both players see incoming reactions even
          when chat is closed. Pointer-events: none so it never steals
          taps from the board. */}
      <FlyingEmojiOverlay
        flying={reactions.flying}
        onComplete={reactions.removeFlying}
      />
    </>
  );
}
