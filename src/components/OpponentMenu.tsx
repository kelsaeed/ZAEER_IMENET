'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { format } from '@/game/locales';
import { sendFriendRequest, removeFriendship, findProfileByUsername } from '@/lib/supabase/friends';
import {
  blockUser, unblockUser, isBlockedByMe,
  muteUserChat, unmuteUserChat, isMutedByMe,
  getHeadToHead, getFriendStatus,
  type FriendBadgeStatus, type HeadToHead,
} from '@/lib/supabase/social';
import Avatar from './Avatar';
import LoadingEmojis from './LoadingEmojis';

/**
 * In-match opponent menu. Two display modes:
 *
 *   • mode='compact' → small popover anchored under the player ribbon. Lists
 *     four actions (Add friend / Block / Mute / View profile). Used as the
 *     immediate response to tapping the opponent's chip.
 *
 *   • mode='full'    → full-screen modal showing the opponent's profile,
 *     stats, head-to-head record vs. me, and the same four actions. Reached
 *     by clicking "View profile" inside the compact mode, or directly when
 *     a caller wants the expanded view first.
 *
 * Both modes share the same action handlers; the compact popover just hides
 * the head-to-head block to keep itself small.
 */

interface Props {
  open: boolean;
  /** Initial display mode. The user can promote compact → full from inside. */
  initialMode?: 'compact' | 'full';
  onClose: () => void;
  /** Required to fetch friend status / head-to-head. If null we render an
   *  empty popover — the caller shouldn't open us without an opponent. */
  opponentId: string | null;
  opponentUsername: string | null;
  opponentName: string;
  opponentAvatarUrl: string | null;
  /** Pixel anchor for the compact popover. Coordinates are page-relative
   *  (i.e. clientX/Y from the click event). Ignored in 'full' mode. */
  anchor?: { x: number; y: number };
  /** Game ID the menu is anchored on, used to wire the "Open full page"
   *  link with ?from=match&gameId=X so the profile page's back button
   *  knows to come back to this match. */
  gameId?: string | null;
}

interface PublicProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_admin: boolean;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}

export default function OpponentMenu({
  open, initialMode = 'compact', onClose,
  opponentId, opponentUsername, opponentName, opponentAvatarUrl, anchor, gameId,
}: Props) {
  const { user } = useUser();
  const { theme, isRTL, t } = useSettings();
  const [mode, setMode] = useState<'compact' | 'full'>(initialMode);
  const [friend, setFriend] = useState<{ status: FriendBadgeStatus; friendshipId: number | null }>(
    { status: 'none', friendshipId: null }
  );
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState<null | 'friend' | 'block' | 'mute'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Profile + head-to-head are only fetched once we expand to the full view.
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [h2h, setH2h] = useState<HeadToHead | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Reset mode whenever the menu re-opens — caller decides initial state.
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setMsg(null);
    }
  }, [open, initialMode]);

  // Load lightweight social state on open. The compact menu only needs
  // friend/blocked/muted booleans — the full profile fetch is gated to
  // mode='full'.
  useEffect(() => {
    if (!open || !user || !opponentId) return;
    let mounted = true;
    Promise.all([
      getFriendStatus(user.id, opponentId).catch(() => ({ status: 'none' as FriendBadgeStatus, friendshipId: null })),
      isBlockedByMe(user.id, opponentId).catch(() => false),
      isMutedByMe(user.id, opponentId).catch(() => false),
    ]).then(([f, b, m]) => {
      if (!mounted) return;
      setFriend(f);
      setBlocked(b);
      setMuted(m);
    });
    return () => { mounted = false; };
  }, [open, user, opponentId]);

  // Lazy-load the full profile + head-to-head when we expand.
  useEffect(() => {
    if (mode !== 'full' || !open || !user || !opponentId || !opponentUsername) return;
    let mounted = true;
    setProfileLoading(true);
    Promise.all([
      findProfileByUsername(opponentUsername).catch(() => null),
      getHeadToHead(user.id, opponentId).catch(() => null),
    ]).then(([p, h]) => {
      if (!mounted) return;
      if (p) setProfile(p as PublicProfile);
      if (h) setH2h(h);
      setProfileLoading(false);
    });
    return () => { mounted = false; };
  }, [mode, open, user, opponentId, opponentUsername]);

  // Close on Escape so a stray tap doesn't trap the user.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleFriend = useCallback(async () => {
    if (!user || !opponentId) return;
    setBusy('friend'); setMsg(null);
    try {
      if (friend.status === 'friends' || friend.status === 'pending-out') {
        if (friend.friendshipId) await removeFriendship(friend.friendshipId);
        setMsg(t('social.friendRemoved'));
      } else if (friend.status === 'none') {
        await sendFriendRequest({ myId: user.id, addresseeId: opponentId });
        setMsg(t('social.requestSent'));
      }
      // Refetch so the friendshipId we just created (or removed) is in sync —
      // otherwise a user who clicked Add → Cancel quickly would leave us with
      // no id to delete.
      const fresh = await getFriendStatus(user.id, opponentId);
      setFriend(fresh);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Could not update.');
    } finally {
      setBusy(null);
    }
  }, [user, opponentId, friend, t]);

  const handleBlock = useCallback(async () => {
    if (!user || !opponentId) return;
    setBusy('block'); setMsg(null);
    try {
      if (blocked) {
        await unblockUser(user.id, opponentId);
        setBlocked(false);
        setMsg(t('social.unblocked'));
      } else {
        await blockUser(user.id, opponentId);
        setBlocked(true);
        setMsg(t('social.blocked'));
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Could not update.');
    } finally {
      setBusy(null);
    }
  }, [user, opponentId, blocked, t]);

  const handleMute = useCallback(async () => {
    if (!user || !opponentId) return;
    setBusy('mute'); setMsg(null);
    try {
      if (muted) {
        await unmuteUserChat(user.id, opponentId);
        setMuted(false);
        setMsg(t('social.unmuted'));
      } else {
        await muteUserChat(user.id, opponentId);
        setMuted(true);
        setMsg(t('social.muted'));
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Could not update.');
    } finally {
      setBusy(null);
    }
  }, [user, opponentId, muted, t]);

  // Action button factory — used by both compact and full modes so the four
  // buttons stay visually consistent.
  function ActionButton({
    onClick, busyKey, label, icon, danger,
  }: {
    onClick: () => void; busyKey: 'friend' | 'block' | 'mute';
    label: string; icon: string; danger?: boolean;
  }) {
    const isBusy = busy === busyKey;
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!!busy}
        className="w-full inline-flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50"
        style={{
          background: theme.panelBg,
          border: `1px solid ${danger ? 'rgba(239,68,68,0.35)' : theme.panelBorder}`,
          color: danger ? '#fca5a5' : theme.textPrimary,
        }}
      >
        <span aria-hidden className="text-lg leading-none">{icon}</span>
        <span className="flex-1 text-start">{label}</span>
        {isBusy && <LoadingEmojis size={12} gap={2} />}
      </button>
    );
  }

  const friendLabel =
    friend.status === 'friends'   ? t('social.unfriend')
    : friend.status === 'pending-out' ? t('social.cancelRequest')
    : friend.status === 'pending-in'  ? t('social.acceptOnFriendsTab')
    : t('social.addFriend');
  const friendIcon =
    friend.status === 'friends' || friend.status === 'pending-out' ? '👋' : '🤝';
  const blockLabel = blocked ? t('social.unblock') : t('social.block');
  const muteLabel  = muted   ? t('social.unmute')  : t('social.mute');

  // ────────── Compact popover ──────────
  // We render a fixed-position panel anchored near the click. Coordinates
  // are clamped into the viewport so we never spill off-screen on phones.
  const COMPACT_W = 240;
  const COMPACT_H_MAX = 320;
  let popX = 0, popY = 0;
  if (anchor) {
    if (typeof window !== 'undefined') {
      popX = Math.max(8, Math.min(anchor.x - COMPACT_W / 2, window.innerWidth - COMPACT_W - 8));
      popY = Math.min(anchor.y + 8, window.innerHeight - COMPACT_H_MAX - 8);
    } else {
      popX = anchor.x; popY = anchor.y;
    }
  }

  const profileSrc: PublicProfile | null = profile ?? null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Click-outside overlay. Compact mode uses a transparent layer
              so the rest of the page stays visible; full mode dims it. */}
          <motion.div
            key="opp-menu-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{
              background: mode === 'full' ? 'rgba(0,0,0,0.7)' : 'transparent',
              backdropFilter: mode === 'full' ? 'blur(6px)' : 'none',
            }}
          />

          {mode === 'compact' && opponentId && (
            <motion.div
              key="opp-menu-compact"
              dir={isRTL ? 'rtl' : 'ltr'}
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="fixed z-50 rounded-xl shadow-xl overflow-hidden"
              style={{
                left: popX,
                top: popY,
                width: COMPACT_W,
                background: theme.panelBg,
                border: `1px solid ${theme.panelBorder}`,
                color: theme.textPrimary,
              }}
            >
              <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: theme.panelBorder }}>
                <Avatar url={opponentAvatarUrl} name={opponentName} size={32} accent="p2" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold truncate text-sm" style={{ color: theme.p2Color }}>
                    {opponentName}
                  </div>
                  {opponentUsername && (
                    <div className="text-[11px] opacity-60 truncate">@{opponentUsername}</div>
                  )}
                </div>
              </div>
              <div className="p-2 flex flex-col gap-1.5">
                {friend.status === 'pending-in' ? (
                  // Incoming request — kept as a non-button hint, the user
                  // accepts it from the friends tab on the lobby page.
                  <div className="text-xs text-center py-1.5 opacity-70">{friendLabel}</div>
                ) : (
                  <ActionButton onClick={handleFriend} busyKey="friend" label={friendLabel} icon={friendIcon} />
                )}
                <ActionButton onClick={handleMute} busyKey="mute" label={muteLabel} icon={muted ? '🔔' : '🔕'} />
                <ActionButton onClick={handleBlock} busyKey="block" label={blockLabel} icon={blocked ? '✅' : '🚫'} danger={!blocked} />
                <button
                  type="button"
                  onClick={() => setMode('full')}
                  className="w-full inline-flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.01]"
                  style={{
                    background: theme.p2AccentBg,
                    border: `1px solid ${theme.p2AccentBorder}`,
                    color: theme.p2Color,
                  }}
                >
                  <span aria-hidden className="text-lg leading-none">👤</span>
                  <span className="flex-1 text-start">{t('social.viewProfile')}</span>
                </button>
                {msg && (
                  <div className="text-[11px] text-center opacity-80 mt-1">{msg}</div>
                )}
              </div>
            </motion.div>
          )}

          {mode === 'full' && (
            <motion.div
              key="opp-menu-full"
              dir={isRTL ? 'rtl' : 'ltr'}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed inset-0 z-50 flex items-center justify-center px-4"
              // Outer wrapper closes on backdrop click; inner panel stops
              // propagation so clicks inside don't dismiss the modal.
              onClick={onClose}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
                style={{
                  background: theme.panelBg,
                  border: `1px solid ${theme.panelBorder}`,
                  color: theme.textPrimary,
                  maxHeight: 'calc(100dvh - 32px)',
                  overflowY: 'auto',
                }}
              >
                {/* Header — banner + close button */}
                <div className="relative px-5 pt-5 pb-3" style={{ background: `linear-gradient(135deg, ${theme.p2AccentBg}, transparent)` }}>
                  <button
                    onClick={onClose}
                    aria-label={t('settings.close')}
                    className="absolute top-2 rounded-full w-8 h-8 inline-flex items-center justify-center text-sm font-bold transition-colors hover:scale-110"
                    style={{
                      [isRTL ? 'left' : 'right']: 8,
                      background: theme.panelBg,
                      border: `1px solid ${theme.panelBorder}`,
                      color: theme.textPrimary,
                    } as React.CSSProperties}
                  >✕</button>
                  <div className="flex items-start gap-4">
                    <Avatar
                      url={profileSrc?.avatar_url ?? opponentAvatarUrl}
                      name={profileSrc?.display_name ?? opponentName}
                      size={72}
                      accent="p2"
                      ring
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-extrabold truncate" style={{ color: theme.p2Color }}>
                        {profileSrc?.display_name ?? opponentName}
                      </h2>
                      {(profileSrc?.username ?? opponentUsername) && (
                        <div className="text-sm opacity-70 truncate">
                          @{profileSrc?.username ?? opponentUsername}
                        </div>
                      )}
                      {profileSrc?.is_admin && (
                        <div className="text-xs mt-1" style={{ color: theme.p1Color }}>★ {t('auth.admin')}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-5 pb-5 space-y-4">
                  {profileLoading && !profileSrc ? (
                    <div className="py-6 flex items-center justify-center">
                      <LoadingEmojis size={20} />
                    </div>
                  ) : (
                    <>
                      {profileSrc?.bio && (
                        <div className="text-sm opacity-90 whitespace-pre-line">{profileSrc.bio}</div>
                      )}

                      {/* Profile-wide rating + W/L. Same layout as /u/[username]. */}
                      <div className="grid grid-cols-3 gap-2">
                        <Stat label={t('social.rating')} value={profileSrc?.rating ?? 0} colour={theme.p1Color} bg={theme.panelBg} border={theme.panelBorder} />
                        <Stat label={t('social.wins')}   value={profileSrc?.wins   ?? 0} colour={theme.p1Color} bg={theme.panelBg} border={theme.panelBorder} />
                        <Stat label={t('social.losses')} value={profileSrc?.losses ?? 0} colour={theme.p2Color} bg={theme.panelBg} border={theme.panelBorder} />
                      </div>

                      {/* Head-to-head — the "history of win, lose between us two". */}
                      {h2h && (
                        <div
                          className="rounded-xl p-4"
                          style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
                        >
                          <div className="text-xs uppercase tracking-wider opacity-70 mb-2 text-center">
                            {t('social.headToHead')}
                          </div>
                          {h2h.total === 0 ? (
                            <div className="text-sm text-center opacity-70 py-2">{t('social.noHistory')}</div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between gap-2 text-sm font-bold">
                                <span style={{ color: theme.p1Color }}>{format(t('social.youCount'), { n: h2h.myWins })}</span>
                                {h2h.draws > 0 && (
                                  <span className="opacity-70 text-xs">
                                    {format(t('social.drawsCount'), { n: h2h.draws })}
                                  </span>
                                )}
                                <span style={{ color: theme.p2Color }}>{format(t('social.themCount'), { n: h2h.theirWins })}</span>
                              </div>
                              {/* Visual bar — width proportional to wins. */}
                              <div className="mt-2 h-2 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.07)' }}>
                                {h2h.total > 0 && (
                                  <>
                                    <div style={{ width: `${(h2h.myWins / h2h.total) * 100}%`, background: theme.p1Color }} />
                                    <div style={{ width: `${(h2h.draws / h2h.total) * 100}%`, background: theme.textMuted, opacity: 0.4 }} />
                                    <div style={{ width: `${(h2h.theirWins / h2h.total) * 100}%`, background: theme.p2Color }} />
                                  </>
                                )}
                              </div>
                              <div className="text-[11px] opacity-60 text-center mt-2">
                                {format(t('social.totalMatches'), { n: h2h.total })}
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Action grid */}
                      <div className="grid grid-cols-1 gap-2">
                        {friend.status === 'pending-in' ? (
                          <Link
                            href="/play"
                            className="rounded-lg px-3 py-2.5 text-sm font-semibold inline-flex items-center gap-3"
                            style={{
                              background: theme.buttonRotateBg,
                              border: `1px solid ${theme.buttonRotateBorder}`,
                              color: theme.buttonRotateText,
                            }}
                          >
                            <span aria-hidden className="text-lg leading-none">📥</span>
                            <span>{t('social.acceptOnFriendsTab')}</span>
                          </Link>
                        ) : (
                          <ActionButton onClick={handleFriend} busyKey="friend" label={friendLabel} icon={friendIcon} />
                        )}
                        <ActionButton onClick={handleMute}  busyKey="mute"  label={muteLabel}  icon={muted ? '🔔' : '🔕'} />
                        <ActionButton onClick={handleBlock} busyKey="block" label={blockLabel} icon={blocked ? '✅' : '🚫'} danger={!blocked} />
                        {opponentUsername && (
                          <Link
                            href={
                              gameId
                                ? `/u/${opponentUsername}?from=match&gameId=${gameId}`
                                : `/u/${opponentUsername}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg px-3 py-2.5 text-sm font-semibold inline-flex items-center gap-3 transition-transform hover:scale-[1.01]"
                            style={{
                              background: theme.panelBg,
                              border: `1px solid ${theme.panelBorder}`,
                              color: theme.textMuted,
                            }}
                          >
                            <span aria-hidden className="text-lg leading-none">↗</span>
                            <span>{t('social.openFullPage')}</span>
                          </Link>
                        )}
                      </div>

                      {msg && (
                        <div className="text-xs text-center opacity-80">{msg}</div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

function Stat({
  label, value, colour, bg, border,
}: { label: string; value: number; colour: string; bg: string; border: string }) {
  return (
    <div className="rounded-lg p-2 text-center" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-lg font-extrabold" style={{ color: colour }}>{value}</div>
    </div>
  );
}
