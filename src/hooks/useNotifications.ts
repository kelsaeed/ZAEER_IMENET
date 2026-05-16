'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from './useUser';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { listFriendships, FriendProfile } from '@/lib/supabase/friends';
import {
  listYourTurnNotifications,
  YourTurnNotification,
  listNewPuzzleNotifications,
  NewPuzzleNotification,
  markAllBellNotificationsRead,
} from '@/lib/supabase/notifications';

/** localStorage key holding the ISO timestamp of the last time this user
 *  opened the notification bell. Anything older than this is "seen" and
 *  must not light the red badge again. Per-user so two accounts on the
 *  same browser don't clobber each other's seen-state. */
function seenKey(userId: string) {
  return `zaeer.notifSeenAt:${userId}`;
}
function readSeenAt(userId: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(seenKey(userId));
    return raw ? new Date(raw).getTime() : 0;
  } catch {
    return 0;
  }
}

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
  /** Async games where it's your turn and you haven't opened the match
   *  since the opponent's last move. One ping per game; emptied when the
   *  match page marks them read. */
  yourTurnGames: YourTurnNotification[];
  /** "Today's puzzle is up" pings — fanned out by the publish trigger.
   *  At most one is meaningful at a time (today's puzzle), but we list
   *  the array in case the trigger fires on multiple days unread. */
  newPuzzles: NewPuzzleNotification[];
  /** Sum of all individual pending notifications — used for the dropdown's
   *  "N new" pill and the section counts. */
  totalUnread: number;
  /** How many notifications arrived AFTER the user last opened the bell.
   *  This — not totalUnread — drives the red dot, so glancing at the bell
   *  clears it even though actionable items (friend requests) remain in
   *  the list. */
  unseenCount: number;
  /** Mark everything currently visible as seen: clears the red badge and
   *  (server-side) the passive your-turn / new-puzzle pings. Call this
   *  when the bell dropdown opens. */
  markSeen: () => Promise<void>;
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
  const [yourTurnGames, setYourTurnGames] = useState<YourTurnNotification[]>([]);
  const [newPuzzles, setNewPuzzles] = useState<NewPuzzleNotification[]>([]);
  const [loading, setLoading] = useState(true);
  // ms epoch of the last bell-open. Re-read whenever the user changes.
  const [seenAt, setSeenAt] = useState(0);
  useEffect(() => {
    setSeenAt(user ? readSeenAt(user.id) : 0);
  }, [user]);

  const refresh = useCallback(async () => {
    if (!user) {
      setFriendRequests([]);
      setUnreadDms([]);
      setYourTurnGames([]);
      setNewPuzzles([]);
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

    // 1b. Async "your turn" pings.
    try {
      setYourTurnGames(await listYourTurnNotifications(user.id));
    } catch {
      setYourTurnGames([]);
    }

    // 1c. "Today's puzzle is up" pings — written by the publish trigger.
    try {
      setNewPuzzles(await listNewPuzzleNotifications(user.id));
    } catch {
      setNewPuzzles([]);
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
      // Async "your turn" pings — INSERT (new turn), UPDATE (mark-read).
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refresh]);

  const totalUnread =
    friendRequests.length
    + unreadDms.reduce((s, d) => s + d.unreadCount, 0)
    + yourTurnGames.length
    + newPuzzles.length;

  // Count only notifications newer than the last bell-open. Each type
  // carries its own timestamp; anything at-or-before `seenAt` has already
  // been looked at and must not relight the dot.
  const unseenCount = useMemo(() => {
    const after = (iso: string | null | undefined) =>
      !!iso && new Date(iso).getTime() > seenAt;
    let n = 0;
    for (const f of friendRequests) if (after(f.createdAt)) n++;
    for (const d of unreadDms) if (after(d.lastAt)) n += d.unreadCount;
    for (const g of yourTurnGames) if (after(g.createdAt)) n++;
    for (const p of newPuzzles) if (after(p.createdAt)) n++;
    return n;
  }, [friendRequests, unreadDms, yourTurnGames, newPuzzles, seenAt]);

  const markSeen = useCallback(async () => {
    if (!user) return;
    const now = new Date();
    try {
      window.localStorage.setItem(seenKey(user.id), now.toISOString());
    } catch { /* private mode — badge will just re-clear next open */ }
    setSeenAt(now.getTime());
    // Passive pings (your-turn, new-puzzle) are "consumed" by being seen —
    // drop them server-side so they don't pile up across sessions. Friend
    // requests / DMs stay actionable; they simply stop counting as unseen.
    try {
      await markAllBellNotificationsRead(user.id);
    } catch { /* offline / table missing — local seenAt still clears the dot */ }
    await refresh();
  }, [user, refresh]);

  return {
    loading, friendRequests, unreadDms, yourTurnGames, newPuzzles,
    totalUnread, unseenCount, markSeen, refresh,
  };
}
