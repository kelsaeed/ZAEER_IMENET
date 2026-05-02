'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { useNotifications, UnreadDmThread } from '@/hooks/useNotifications';
import { acceptFriendRequest, removeFriendship, FriendProfile } from '@/lib/supabase/friends';
import LoadingEmojis from './LoadingEmojis';
import Avatar from './Avatar';
import FriendDm from './FriendDm';

/** Top-bar notification bell. Shows a red badge with the total unread
 *  count, opens a dropdown with grouped notifications (friend requests
 *  + unread DMs), and lets the user act inline (Accept / Decline /
 *  open chat). Real-time updates via the useNotifications hook. */
export default function NotificationBell() {
  const { user } = useUser();
  const { theme } = useSettings();
  const { loading, friendRequests, unreadDms, totalUnread, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dmTarget, setDmTarget] = useState<UnreadDmThread['friend'] | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Outside click closes the dropdown.
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  if (!user) return null;

  async function handleAccept(f: FriendProfile) {
    setBusy(`accept-${f.friendshipId}`);
    try {
      await acceptFriendRequest(f.friendshipId);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleDecline(f: FriendProfile) {
    setBusy(`decline-${f.friendshipId}`);
    try {
      await removeFriendship(f.friendshipId);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="relative" ref={wrapperRef}>
        <button
          onClick={() => setOpen(o => !o)}
          aria-label="Notifications"
          className="rounded-full h-10 w-10 inline-flex items-center justify-center text-lg relative transition-transform hover:scale-105"
          style={{
            background: theme.panelBg,
            border: `1px solid ${totalUnread > 0 ? theme.p1Color : theme.panelBorder}`,
            color: theme.textPrimary,
          }}
        >
          <span className={totalUnread > 0 ? 'animate-bell' : ''} aria-hidden>
            🔔
          </span>
          {totalUnread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 rounded-full text-[10px] font-extrabold px-1.5 py-0.5 min-w-[18px] text-center select-none"
              style={{
                background: '#ef4444',
                color: '#fff',
                boxShadow: '0 0 10px rgba(239,68,68,0.6)',
                lineHeight: 1,
              }}
            >
              {totalUnread > 99 ? '99+' : totalUnread}
            </motion.span>
          )}
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="absolute right-0 mt-2 rounded-2xl overflow-hidden z-40"
              style={{
                width: 340,
                maxWidth: 'calc(100vw - 24px)',
                background: theme.bgGradient,
                border: `1px solid ${theme.panelBorder}`,
                color: theme.textPrimary,
                boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
              }}
            >
              <div
                className="px-4 py-3 flex items-center justify-between border-b"
                style={{ borderColor: theme.panelBorder }}
              >
                <span className="font-bold">🔔 Notifications</span>
                {totalUnread > 0 && (
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: theme.p1AccentBg,
                      border: `1px solid ${theme.p1AccentBorder}`,
                      color: theme.p1Color,
                    }}
                  >
                    {totalUnread} new
                  </span>
                )}
              </div>

              <div className="max-h-[60vh] overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <LoadingEmojis size={22} gap={4} />
                  </div>
                ) : totalUnread === 0 ? (
                  <div className="text-center py-10 px-4">
                    <div className="text-4xl mb-2">✨</div>
                    <div className="font-semibold">All caught up!</div>
                    <div className="text-xs opacity-60 mt-1">No new notifications.</div>
                  </div>
                ) : (
                  <>
                    {friendRequests.length > 0 && (
                      <div>
                        <div
                          className="px-4 py-2 text-xs font-bold uppercase tracking-wider opacity-70"
                          style={{ borderBottom: `1px solid ${theme.panelBorder}` }}
                        >
                          📥 Friend requests · {friendRequests.length}
                        </div>
                        {friendRequests.map(f => (
                          <div
                            key={f.friendshipId}
                            className="px-4 py-3 flex items-center gap-3"
                            style={{ borderBottom: `1px solid ${theme.panelBorder}` }}
                          >
                            <Link
                              href={`/u/${f.username}`}
                              onClick={() => setOpen(false)}
                              className="shrink-0"
                            >
                              <Avatar url={f.avatar_url} name={f.display_name} size={36} />
                            </Link>
                            <div className="flex-1 min-w-0">
                              <Link
                                href={`/u/${f.username}`}
                                onClick={() => setOpen(false)}
                                className="font-bold text-sm truncate block hover:underline"
                              >
                                {f.display_name}
                              </Link>
                              <div className="text-xs opacity-60 truncate">
                                @{f.username} · wants to be friends
                              </div>
                            </div>
                            <button
                              onClick={() => handleAccept(f)}
                              disabled={busy !== null}
                              className="rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 inline-flex items-center justify-center min-w-[60px]"
                              style={{
                                background: theme.buttonRotateBg,
                                border: `1px solid ${theme.buttonRotateBorder}`,
                                color: theme.buttonRotateText,
                              }}
                            >
                              {busy === `accept-${f.friendshipId}`
                                ? <LoadingEmojis size={10} gap={2} />
                                : 'Accept'}
                            </button>
                            <button
                              onClick={() => handleDecline(f)}
                              disabled={busy !== null}
                              aria-label="Decline"
                              className="rounded-lg w-8 h-8 inline-flex items-center justify-center text-base opacity-70 hover:opacity-100 disabled:opacity-30"
                              style={{
                                background: theme.buttonBg,
                                border: `1px solid ${theme.buttonBorder}`,
                                color: theme.textPrimary,
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {unreadDms.length > 0 && (
                      <div>
                        <div
                          className="px-4 py-2 text-xs font-bold uppercase tracking-wider opacity-70"
                          style={{ borderBottom: `1px solid ${theme.panelBorder}` }}
                        >
                          💬 Unread messages · {unreadDms.reduce((s, d) => s + d.unreadCount, 0)}
                        </div>
                        {unreadDms.map(dm => (
                          <button
                            key={dm.friend.id}
                            onClick={() => {
                              setOpen(false);
                              setDmTarget(dm.friend);
                            }}
                            className="px-4 py-3 flex items-center gap-3 w-full text-left transition-colors hover:bg-white/5"
                            style={{ borderBottom: `1px solid ${theme.panelBorder}` }}
                          >
                            <Avatar
                              url={dm.friend.avatar_url}
                              name={dm.friend.display_name}
                              size={36}
                              accent="p2"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm truncate">
                                  {dm.friend.display_name}
                                </span>
                                <span
                                  className="text-[10px] font-extrabold rounded-full px-1.5 py-0.5 min-w-[16px] text-center shrink-0"
                                  style={{ background: '#ef4444', color: '#fff' }}
                                >
                                  {dm.unreadCount}
                                </span>
                              </div>
                              <div className="text-xs opacity-70 truncate">
                                {dm.lastBody}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div
                className="px-3 py-2 border-t flex justify-between items-center"
                style={{ borderColor: theme.panelBorder }}
              >
                <Link
                  href="/play"
                  onClick={() => setOpen(false)}
                  className="text-xs opacity-70 hover:opacity-100"
                  style={{ color: theme.p1Color }}
                >
                  Open lobby →
                </Link>
                <Link
                  href="/profile"
                  onClick={() => setOpen(false)}
                  className="text-xs opacity-60 hover:opacity-100"
                >
                  Profile
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Inline DM modal (opens when user taps an unread thread). */}
      {dmTarget && (
        <FriendDm
          friendId={dmTarget.id}
          friendName={dmTarget.display_name}
          friendAvatarUrl={dmTarget.avatar_url}
          onClose={() => {
            setDmTarget(null);
            // Mark-as-read happens inside FriendDm; this just refreshes the bell.
            refresh();
          }}
        />
      )}
    </>
  );
}
