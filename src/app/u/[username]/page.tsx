'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { findProfileByUsername, sendFriendRequest, listFriendships } from '@/lib/supabase/friends';
import LoadingEmojis from '@/components/LoadingEmojis';
import Avatar from '@/components/Avatar';
import AuthBadge from '@/components/AuthBadge';
import NotificationBell from '@/components/NotificationBell';

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

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params?.username ?? '';
  const router = useRouter();
  const { user } = useUser();
  const { theme, isRTL, t } = useSettings();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<'none' | 'pending-out' | 'pending-in' | 'friends' | 'self'>('none');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    findProfileByUsername(username)
      .then(p => {
        if (!mounted) return;
        if (!p) {
          setError(`No user with username @${username}.`);
        } else {
          setProfile(p as PublicProfile);
        }
        setLoading(false);
      })
      .catch(() => {
        if (mounted) {
          setError('Could not load profile.');
          setLoading(false);
        }
      });
    return () => { mounted = false; };
  }, [username]);

  // Resolve current friendship state.
  useEffect(() => {
    if (!user || !profile) return;
    if (user.id === profile.id) {
      setFriendStatus('self');
      return;
    }
    listFriendships(user.id).then(list => {
      const match = list.find(f => f.id === profile.id);
      if (!match) setFriendStatus('none');
      else if (match.status === 'accepted') setFriendStatus('friends');
      else if (match.outgoing) setFriendStatus('pending-out');
      else setFriendStatus('pending-in');
    });
  }, [user, profile]);

  async function handleAddFriend() {
    if (!user || !profile) return;
    setBusy(true); setMsg(null);
    try {
      await sendFriendRequest({ myId: user.id, addresseeId: profile.id });
      setFriendStatus('pending-out');
      setMsg('Friend request sent!');
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: theme.bgGradient, color: theme.textPrimary }}>
        <LoadingEmojis size={28} />
      </main>
    );
  }
  if (error || !profile) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: theme.bgGradient, color: theme.textPrimary }}>
        <div className="text-center">
          <div className="text-4xl mb-3">😕</div>
          <div className="font-bold mb-3">{error}</div>
          <Link
            href="/"
            className="rounded-lg px-4 py-2 inline-block font-semibold"
            style={{ background: theme.buttonRotateBg, border: `1px solid ${theme.buttonRotateBorder}`, color: theme.buttonRotateText }}
          >
            ← Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen px-4 py-10"
      style={{ background: theme.bgGradient, color: theme.textPrimary }}
    >
      <div
        className="fixed top-3 z-30 flex items-center gap-2"
        style={{ [isRTL ? 'left' : 'right']: 12 } as React.CSSProperties}
      >
        <NotificationBell />
        <AuthBadge side={isRTL ? 'left' : 'right'} />
      </div>

      <div className="max-w-xl mx-auto">
        <Link href="/" className="text-sm opacity-70 hover:opacity-100">← Home</Link>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6 mt-3"
          style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
        >
          <div className="flex items-start gap-4 mb-4">
            <Avatar url={profile.avatar_url} name={profile.display_name} size={80} ring />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-extrabold truncate" style={{ color: theme.p1Color }}>
                {profile.display_name}
              </h1>
              <div className="text-sm opacity-70 truncate">@{profile.username}</div>
              {profile.is_admin && (
                <div className="text-xs mt-1" style={{ color: theme.p1Color }}>★ {t('auth.admin')}</div>
              )}
            </div>
          </div>

          {profile.bio && <div className="text-sm opacity-90 mb-4 whitespace-pre-line">{profile.bio}</div>}

          <div className="grid grid-cols-3 gap-3 mb-5">
            <Stat label="Rating" value={profile.rating} theme={theme} />
            <Stat label="Wins" value={profile.wins} theme={theme} />
            <Stat label="Losses" value={profile.losses} theme={theme} />
          </div>

          {msg && (
            <div
              className="text-sm rounded-md px-3 py-2 mb-3"
              style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#bbf7d0' }}
            >
              {msg}
            </div>
          )}

          {!user ? (
            <Link
              href={`/login?next=/u/${profile.username}`}
              className="rounded-lg w-full inline-flex items-center justify-center px-4 py-2.5 font-semibold"
              style={{ background: theme.buttonRotateBg, border: `1px solid ${theme.buttonRotateBorder}`, color: theme.buttonRotateText }}
            >
              Sign in to add friend
            </Link>
          ) : friendStatus === 'self' ? (
            <Link
              href="/profile"
              className="rounded-lg w-full inline-flex items-center justify-center px-4 py-2.5 font-semibold"
              style={{ background: theme.buttonBg, border: `1px solid ${theme.buttonBorder}`, color: theme.textPrimary }}
            >
              ✏️ Edit your profile
            </Link>
          ) : friendStatus === 'friends' ? (
            <button
              onClick={() => router.push('/play')}
              className="rounded-lg w-full px-4 py-2.5 font-semibold"
              style={{ background: theme.buttonRotateBg, border: `1px solid ${theme.buttonRotateBorder}`, color: theme.buttonRotateText }}
            >
              🤝 Already friends — Play together
            </button>
          ) : friendStatus === 'pending-out' ? (
            <div className="text-center text-sm opacity-70 py-2">📤 Request sent — waiting for them to accept</div>
          ) : friendStatus === 'pending-in' ? (
            <Link
              href="/play"
              className="rounded-lg w-full inline-flex items-center justify-center px-4 py-2.5 font-semibold"
              style={{ background: theme.buttonRotateBg, border: `1px solid ${theme.buttonRotateBorder}`, color: theme.buttonRotateText }}
            >
              📥 They invited you — accept in Friends tab
            </Link>
          ) : (
            <button
              onClick={handleAddFriend}
              disabled={busy}
              className="rounded-lg w-full px-4 py-2.5 font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ background: theme.buttonRotateBg, border: `1px solid ${theme.buttonRotateBorder}`, color: theme.buttonRotateText }}
            >
              {busy ? <LoadingEmojis size={14} gap={2} /> : <>🤝 Add as friend</>}
            </button>
          )}
        </motion.div>
      </div>
    </main>
  );
}

function Stat({ label, value, theme }: { label: string; value: number; theme: ReturnType<typeof useSettings>['theme'] }) {
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-xl font-bold" style={{ color: theme.p1Color }}>{value}</div>
    </div>
  );
}
