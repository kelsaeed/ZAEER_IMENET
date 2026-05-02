'use client';
import { useCallback, useEffect, useState } from 'react';
import { useUser } from './useUser';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { listFriendships, FriendProfile } from '@/lib/supabase/friends';

export interface UnreadDmThread {
  /** The other user. */
  friend: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  unreadCount: number;
  /** Most recent unread message body (for preview). */
  lastBody: string;
  lastAt: string;
}

interface NotificationsState {
  loading: boolean;
  /** Pending incoming friend requests (you are the addressee). */
  friendRequests: FriendProfile[];
  /** DMs grouped by sender that are unread (recipient = me, read_at = null). */
  unreadDms: UnreadDmThread[];
  /** Sum of all individual notifications — used for the badge. */
  totalUnread: number;
  /** Manual refresh — exposed so child UIs can re-pull after acting on a notif. */
  refresh: () => Promise<void>;
}

interface RawDmRow {
  id: number;
  sender_id: string;
  body: string;
  created_at: string;
  sender: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
}

/** App-wide notifications. Subscribes to friendships and dm_messages so the
 *  bell updates the moment something happens. Falls back silently if the
 *  social tables aren't reachable (e.g. migration not yet run) — the bell
 *  just shows zero notifications instead of crashing. */
export function useNotifications(): NotificationsState {
  const { user } = useUser();
  const [friendRequests, setFriendRequests] = useState<FriendProfile[]>([]);
  const [unreadDms, setUnreadDms] = useState<UnreadDmThread[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setFriendRequests([]);
      setUnreadDms([]);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseBrowser();

    // 1. Pending incoming friend requests.
    try {
      const all = await listFriendships(user.id);
      setFriendRequests(all.filter(f => f.status === 'pending' && !f.outgoing));
    } catch {
      setFriendRequests([]);
    }

    // 2. Unread DMs grouped by sender.
    try {
      const { data } = await supabase
        .from('dm_messages')
        .select(`
          id, sender_id, body, created_at,
          sender:profiles!dm_messages_sender_id_fkey ( id, username, display_name, avatar_url )
        `)
        .eq('recipient_id', user.id)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(200);
      const rows = (data as unknown as RawDmRow[]) ?? [];
      const map = new Map<string, UnreadDmThread>();
      for (const row of rows) {
        if (!row.sender) continue;
        const existing = map.get(row.sender_id);
        if (existing) {
          existing.unreadCount++;
        } else {
          map.set(row.sender_id, {
            friend: {
              id: row.sender.id,
              username: row.sender.username,
              display_name: row.sender.display_name,
              avatar_url: row.sender.avatar_url,
            },
            unreadCount: 1,
            lastBody: row.body,
            lastAt: row.created_at,
          });
        }
      }
      setUnreadDms(Array.from(map.values()).sort((a, b) =>
        b.lastAt.localeCompare(a.lastAt)
      ));
    } catch {
      setUnreadDms([]);
    }

    setLoading(false);
  }, [user]);

  // Initial load + Realtime subscriptions.
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    refresh();

    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel(`notifications:${user.id}`)
      // Any friendships change involving me — incoming requests, accepts, removals.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        () => refresh(),
      )
      // New DMs to me.
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dm_messages',
          filter: `recipient_id=eq.${user.id}`,
        },
        () => refresh(),
      )
      // Mark-as-read updates.
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'dm_messages',
          filter: `recipient_id=eq.${user.id}`,
        },
        () => refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  const totalUnread =
    friendRequests.length + unreadDms.reduce((s, d) => s + d.unreadCount, 0);

  return { loading, friendRequests, unreadDms, totalUnread, refresh };
}
