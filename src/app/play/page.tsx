'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import {
  createOnlineGame,
  joinOnlineGame,
  findGameByInviteCode,
  quickMatch,
} from '@/lib/supabase/games';
import {
  listFriendships,
  removeFriendship,
  acceptFriendRequest,
  sendFriendRequest,
  searchProfiles,
  FriendProfile,
} from '@/lib/supabase/friends';
import LoadingEmojis from '@/components/LoadingEmojis';
import AuthBadge from '@/components/AuthBadge';
import NotificationBell from '@/components/NotificationBell';
import Avatar from '@/components/Avatar';
import FriendDm from '@/components/FriendDm';

interface PublicGame {
  id: string;
  player1_id: string;
  player1: { username: string; display_name: string; avatar_url: string | null } | null;
}

type LobbyTab = 'play' | 'friends';

export default function LobbyPage() {
  const router = useRouter();
  const { user, profile, loading: userLoading } = useUser();
  const { theme, isRTL, t } = useSettings();
  const [tab, setTab] = useState<LobbyTab>('play');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Bounce unauthenticated visitors.
  useEffect(() => {
    if (!userLoading && !user) router.replace('/login?next=/play');
  }, [userLoading, user, router]);

  // ── Quick Match ────────────────────────────────────────────────────────
  const handleQuickMatch = useCallback(async () => {
    if (!user || busy) return;
    setError(null);
    setBusy('quick');
    try {
      const { gameId } = await quickMatch({ userId: user.id });
      router.push(`/play/${gameId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not start a quick match.');
      setBusy(null);
    }
  }, [user, busy, router]);

  const handleCreate = useCallback(async (isPublic: boolean) => {
    if (!user || busy) return;
    setError(null);
    setBusy(isPublic ? 'public' : 'private');
    try {
      const game = await createOnlineGame({ userId: user.id, isPublic });
      router.push(`/play/${game.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not create game.');
      setBusy(null);
    }
  }, [user, busy, router]);

  return (
    <main
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen px-4 py-10 sm:py-14"
      style={{ background: theme.bgGradient, color: theme.textPrimary }}
    >
      <div
        className="fixed top-3 z-30 flex items-center gap-2"
        style={{ [isRTL ? 'left' : 'right']: 12 } as React.CSSProperties}
      >
        <NotificationBell />
        <AuthBadge side={isRTL ? 'left' : 'right'} />
      </div>

      <div className="max-w-3xl mx-auto">
        <Link href="/" className="text-sm opacity-70 hover:opacity-100">
          ← {t('auth.backHome')}
        </Link>

        <h1 className="text-3xl sm:text-4xl font-extrabold mt-3 mb-1" style={{ color: theme.p1Color }}>
          🌐 Online
        </h1>
        <p className="text-sm opacity-70 mb-6">
          Find a match in seconds, play with a friend, or browse open rooms.
        </p>

        {/* Tabs */}
        <div className="flex gap-1 mb-5 rounded-xl p-1" style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}>
          <TabBtn label="🎮 Play" active={tab === 'play'} onClick={() => setTab('play')} theme={theme} />
          <TabBtn label="🤝 Friends" active={tab === 'friends'} onClick={() => setTab('friends')} theme={theme} />
        </div>

        {error && (
          <div
            className="text-sm rounded-md px-3 py-2 mb-4"
            style={{
              background: 'rgba(220,38,38,0.15)',
              border: '1px solid rgba(220,38,38,0.4)',
              color: '#fecaca',
            }}
          >
            {error}
          </div>
        )}

        {tab === 'play' && (
          <PlayTab
            theme={theme}
            busy={busy}
            onQuickMatch={handleQuickMatch}
            onCreate={handleCreate}
            setBusy={setBusy}
            setError={setError}
            user={user}
            router={router}
          />
        )}

        {tab === 'friends' && (
          <FriendsTab
            theme={theme}
            user={user}
            setError={setError}
          />
        )}

        {profile && (
          <div className="text-xs opacity-50 mt-8 text-center">
            Signed in as @{profile.username}
          </div>
        )}
      </div>
    </main>
  );
}

function TabBtn({ label, active, onClick, theme }: { label: string; active: boolean; onClick: () => void; theme: ReturnType<typeof useSettings>['theme'] }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-lg py-2 px-3 text-sm font-semibold transition-colors"
      style={{
        background: active ? theme.buttonRotateBg : 'transparent',
        color: active ? theme.buttonRotateText : theme.textPrimary,
        opacity: active ? 1 : 0.7,
      }}
    >
      {label}
    </button>
  );
}

// ─── Play tab ─────────────────────────────────────────────────────────────

function PlayTab({
  theme, busy, onQuickMatch, onCreate, setBusy, setError, user, router,
}: {
  theme: ReturnType<typeof useSettings>['theme'];
  busy: string | null;
  onQuickMatch: () => void;
  onCreate: (isPublic: boolean) => void;
  setBusy: (b: string | null) => void;
  setError: (e: string | null) => void;
  user: ReturnType<typeof useUser>['user'];
  router: ReturnType<typeof useRouter>;
}) {
  const [joinCode, setJoinCode] = useState('');
  const [games, setGames] = useState<PublicGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);

  // Live list of public open games (small section, collapsed).
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowser();
    let mounted = true;
    async function refresh() {
      const { data } = await supabase
        .from('games')
        .select('id, player1_id, player1:profiles!games_player1_id_fkey(username, display_name, avatar_url)')
        .eq('status', 'waiting')
        .eq('is_public', true)
        .neq('player1_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!mounted) return;
      setGames((data as unknown as PublicGame[]) ?? []);
      setGamesLoading(false);
    }
    refresh();
    const ch = supabase
      .channel('lobby-public')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, () => refresh())
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [user]);

  async function handleJoinByCode() {
    if (!user || !joinCode.trim()) return;
    setError(null);
    setBusy('code');
    try {
      const code = joinCode.trim().toUpperCase();
      const found = await findGameByInviteCode(code);
      if (!found) throw new Error('No game with that code.');
      if (found.player2_id && found.player2_id !== user.id) throw new Error('That game is already full.');
      if (found.player1_id === user.id) {
        router.push(`/play/${found.id}`);
        return;
      }
      if (found.status === 'waiting') {
        await joinOnlineGame({ userId: user.id, gameId: found.id });
      }
      router.push(`/play/${found.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not join with that code.');
      setBusy(null);
    }
  }

  async function handleJoinPublic(g: PublicGame) {
    if (!user) return;
    setError(null);
    setBusy(g.id);
    try {
      await joinOnlineGame({ userId: user.id, gameId: g.id });
      router.push(`/play/${g.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not join.');
      setBusy(null);
    }
  }

  return (
    <>
      {/* The 3 hero actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <ActionCard
          icon="🎯"
          title="Quick Match"
          desc="Find or create the fastest available match. Starts immediately."
          accent
          loading={busy === 'quick'}
          theme={theme}
          onClick={onQuickMatch}
        />
        <ActionCard
          icon="👥"
          title="Play with Friend"
          desc="Create a private room and share the 6-char code."
          loading={busy === 'private'}
          theme={theme}
          onClick={() => onCreate(false)}
        />
        <div
          className="rounded-xl p-4"
          style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
        >
          <div className="text-2xl mb-1">🎟</div>
          <div className="text-sm font-bold mb-2">Join with Code</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
              placeholder="ABC123"
              maxLength={6}
              className="rounded-md px-2 py-1.5 text-sm flex-1 min-w-0 tracking-widest font-mono"
              style={{
                background: theme.inputBg,
                color: theme.inputText,
                border: `1px solid ${theme.buttonBorder}`,
              }}
            />
            <button
              onClick={handleJoinByCode}
              disabled={!joinCode.trim() || busy === 'code'}
              className="rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center min-w-[48px]"
              style={{
                background: theme.buttonRotateBg,
                border: `1px solid ${theme.buttonRotateBorder}`,
                color: theme.buttonRotateText,
              }}
            >
              {busy === 'code' ? <LoadingEmojis size={12} gap={2} /> : 'Go'}
            </button>
          </div>
        </div>
      </div>

      {/* Open public games — secondary list */}
      <details className="mb-4">
        <summary className="cursor-pointer text-sm font-semibold opacity-80 hover:opacity-100">
          🌍 Open public rooms ({gamesLoading ? '…' : games.length})
        </summary>
        <div className="mt-3">
          {gamesLoading ? (
            <div className="flex items-center justify-center py-6"><LoadingEmojis size={22} /></div>
          ) : games.length === 0 ? (
            <div className="text-sm opacity-60 py-3 text-center">No open public rooms.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {games.map(g => (
                <motion.div
                  key={g.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl p-2.5 flex items-center gap-3"
                  style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
                >
                  <Avatar
                    url={g.player1?.avatar_url}
                    name={g.player1?.display_name}
                    size={36}
                    accent="p2"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate text-sm">{g.player1?.display_name ?? 'Anonymous'}</div>
                    <div className="text-xs opacity-70 truncate">@{g.player1?.username ?? '?'}</div>
                  </div>
                  <button
                    onClick={() => handleJoinPublic(g)}
                    disabled={busy === g.id}
                    className="rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 inline-flex items-center justify-center min-w-[60px]"
                    style={{
                      background: theme.buttonRotateBg,
                      border: `1px solid ${theme.buttonRotateBorder}`,
                      color: theme.buttonRotateText,
                    }}
                  >
                    {busy === g.id ? <LoadingEmojis size={12} gap={2} /> : 'Join'}
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </details>
    </>
  );
}

function ActionCard({
  icon, title, desc, accent, loading, theme, onClick,
}: {
  icon: string;
  title: string;
  desc: string;
  accent?: boolean;
  loading?: boolean;
  theme: ReturnType<typeof useSettings>['theme'];
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={loading}
      className="rounded-xl p-4 text-start transition-all disabled:opacity-50"
      style={{
        background: accent ? theme.buttonRotateBg : theme.panelBg,
        border: `1px solid ${accent ? theme.buttonRotateBorder : theme.panelBorder}`,
        color: accent ? theme.buttonRotateText : theme.textPrimary,
        boxShadow: accent ? `0 8px 24px ${theme.p1Color}30` : 'none',
        minHeight: 120,
      }}
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-sm font-bold mb-1">{title}</div>
      <div className="text-xs opacity-80">{desc}</div>
      {loading && <div className="mt-2"><LoadingEmojis size={14} gap={2} /></div>}
    </motion.button>
  );
}

// ─── Friends tab ──────────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  rating: number;
}

function FriendsTab({
  theme, user, setError,
}: {
  theme: ReturnType<typeof useSettings>['theme'];
  user: ReturnType<typeof useUser>['user'];
  setError: (e: string | null) => void;
}) {
  const router = useRouter();
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [dmFriend, setDmFriend] = useState<FriendProfile | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const list = await listFriendships(user.id);
      setFriends(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load friends.');
    } finally {
      setLoading(false);
    }
  }, [user, setError]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: refresh on any friendships change.
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowser();
    const ch = supabase
      .channel('friendships-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refresh]);

  // Debounced fuzzy search — runs ~300ms after typing stops.
  useEffect(() => {
    const q = searchQuery.trim();
    if (!user || q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const results = await searchProfiles(q, user.id);
        setSearchResults(results as SearchResult[]);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery, user]);

  async function handleAddFromSearch(p: SearchResult) {
    if (!user) return;
    setError(null);
    setActionBusy(`add-${p.id}`);
    try {
      await sendFriendRequest({ myId: user.id, addresseeId: p.id });
      setSearchQuery('');
      setSearchResults([]);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not send request.');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleAccept(f: FriendProfile) {
    setActionBusy(`accept-${f.friendshipId}`);
    try {
      await acceptFriendRequest(f.friendshipId);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not accept.');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleRemove(f: FriendProfile) {
    if (!confirm(f.status === 'accepted' ? `Remove @${f.username}?` : 'Cancel request?')) return;
    setActionBusy(`remove-${f.friendshipId}`);
    try {
      await removeFriendship(f.friendshipId);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not remove.');
    } finally {
      setActionBusy(null);
    }
  }

  async function handleChallenge(f: FriendProfile) {
    if (!user) return;
    setError(null);
    setActionBusy(`challenge-${f.friendshipId}`);
    try {
      const game = await createOnlineGame({ userId: user.id, isPublic: false });
      router.push(`/play/${game.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not create game.');
      setActionBusy(null);
    }
  }

  const incoming = friends.filter(f => f.status === 'pending' && !f.outgoing);
  const outgoing = friends.filter(f => f.status === 'pending' && f.outgoing);
  const accepted = friends.filter(f => f.status === 'accepted');

  // Filter out users already in our friendships list (any status) so the
  // search results show people we haven't already requested / friended.
  const knownIds = new Set(friends.map(f => f.id));
  const visibleResults = searchResults.filter(r => !knownIds.has(r.id));

  return (
    <div>
      {/* Add friend — fuzzy search */}
      <div
        className="rounded-xl p-4 mb-4"
        style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
      >
        <div className="text-sm font-bold mb-2">🔎 Find friends</div>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by username or display name…"
          className="w-full rounded-md px-3 py-2 text-sm"
          style={{
            background: theme.inputBg,
            color: theme.inputText,
            border: `1px solid ${theme.buttonBorder}`,
          }}
        />
        {searching && (
          <div className="flex items-center justify-center mt-3"><LoadingEmojis size={14} gap={2} /></div>
        )}
        {!searching && searchQuery.trim().length >= 2 && visibleResults.length === 0 && (
          <div className="text-xs opacity-60 mt-3 text-center">No matching users.</div>
        )}
        {visibleResults.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-3">
            {visibleResults.map(r => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-lg p-2"
                style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}` }}
              >
                <Avatar url={r.avatar_url} name={r.display_name} size={32} accent="p2" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{r.display_name}</div>
                  <div className="text-xs opacity-70 truncate">@{r.username} · ★ {r.rating}</div>
                </div>
                <Link
                  href={`/u/${r.username}`}
                  className="text-xs opacity-70 hover:opacity-100 px-2"
                >
                  View
                </Link>
                <button
                  onClick={() => handleAddFromSearch(r)}
                  disabled={actionBusy === `add-${r.id}`}
                  className="rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 inline-flex items-center justify-center min-w-[72px]"
                  style={{
                    background: theme.buttonRotateBg,
                    border: `1px solid ${theme.buttonRotateBorder}`,
                    color: theme.buttonRotateText,
                  }}
                >
                  {actionBusy === `add-${r.id}` ? <LoadingEmojis size={12} gap={2} /> : '+ Add'}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10"><LoadingEmojis size={26} /></div>
      ) : (
        <>
          {incoming.length > 0 && (
            <Section title={`📥 Incoming requests (${incoming.length})`} theme={theme}>
              {incoming.map(f => (
                <FriendRow
                  key={f.friendshipId}
                  friend={f}
                  theme={theme}
                  busy={actionBusy}
                  primary={{ label: 'Accept', onClick: () => handleAccept(f), busyKey: `accept-${f.friendshipId}` }}
                  secondary={{ label: 'Decline', onClick: () => handleRemove(f), busyKey: `remove-${f.friendshipId}` }}
                />
              ))}
            </Section>
          )}

          {outgoing.length > 0 && (
            <Section title={`📤 Sent (${outgoing.length})`} theme={theme}>
              {outgoing.map(f => (
                <FriendRow
                  key={f.friendshipId}
                  friend={f}
                  theme={theme}
                  busy={actionBusy}
                  badge="Pending"
                  secondary={{ label: 'Cancel', onClick: () => handleRemove(f), busyKey: `remove-${f.friendshipId}` }}
                />
              ))}
            </Section>
          )}

          <Section title={`🤝 Friends (${accepted.length})`} theme={theme}>
            {accepted.length === 0 ? (
              <div className="text-sm opacity-60 py-3 text-center">
                No friends yet. Search above to find someone!
              </div>
            ) : (
              accepted.map(f => (
                <FriendRow
                  key={f.friendshipId}
                  friend={f}
                  theme={theme}
                  busy={actionBusy}
                  iconAction={{ label: '💬', onClick: () => setDmFriend(f), title: 'Chat' }}
                  primary={{ label: '⚔️ Challenge', onClick: () => handleChallenge(f), busyKey: `challenge-${f.friendshipId}` }}
                  secondary={{ label: 'Remove', onClick: () => handleRemove(f), busyKey: `remove-${f.friendshipId}` }}
                />
              ))
            )}
          </Section>
        </>
      )}

      {/* DM modal */}
      {dmFriend && (
        <FriendDm
          friendId={dmFriend.id}
          friendName={dmFriend.display_name}
          friendAvatarUrl={dmFriend.avatar_url}
          onClose={() => setDmFriend(null)}
        />
      )}
    </div>
  );
}

function Section({ title, theme, children }: { title: string; theme: ReturnType<typeof useSettings>['theme']; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-sm font-semibold mb-2 opacity-85">{title}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function FriendRow({
  friend, theme, busy, primary, secondary, badge, iconAction,
}: {
  friend: FriendProfile;
  theme: ReturnType<typeof useSettings>['theme'];
  busy: string | null;
  primary?: { label: string; onClick: () => void; busyKey: string };
  secondary?: { label: string; onClick: () => void; busyKey: string };
  badge?: string;
  iconAction?: { label: string; onClick: () => void; title?: string };
}) {
  return (
    <div
      className="rounded-xl p-3 flex items-center gap-2"
      style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
    >
      <Link href={`/u/${friend.username}`} className="shrink-0">
        <Avatar url={friend.avatar_url} name={friend.display_name} size={42} />
      </Link>
      <div className="flex-1 min-w-0">
        <Link href={`/u/${friend.username}`} className="font-bold truncate block hover:underline">
          {friend.display_name}
        </Link>
        <div className="text-xs opacity-70 truncate">@{friend.username} · ★ {friend.rating}</div>
      </div>
      {badge && <span className="text-xs opacity-70 px-2 py-1 rounded-full" style={{ background: theme.buttonBg }}>{badge}</span>}
      {iconAction && (
        <button
          onClick={iconAction.onClick}
          title={iconAction.title}
          className="rounded-lg w-9 h-9 inline-flex items-center justify-center text-base hover:scale-110 transition-transform"
          style={{
            background: theme.buttonBg,
            border: `1px solid ${theme.buttonBorder}`,
            color: theme.textPrimary,
          }}
        >
          {iconAction.label}
        </button>
      )}
      {primary && (
        <button
          onClick={primary.onClick}
          disabled={busy === primary.busyKey}
          className="rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 inline-flex items-center justify-center min-w-[80px]"
          style={{
            background: theme.buttonRotateBg,
            border: `1px solid ${theme.buttonRotateBorder}`,
            color: theme.buttonRotateText,
          }}
        >
          {busy === primary.busyKey ? <LoadingEmojis size={12} gap={2} /> : primary.label}
        </button>
      )}
      {secondary && (
        <button
          onClick={secondary.onClick}
          disabled={busy === secondary.busyKey}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold opacity-70 hover:opacity-100 disabled:opacity-30"
          style={{
            background: theme.buttonBg,
            border: `1px solid ${theme.buttonBorder}`,
            color: theme.textPrimary,
          }}
        >
          {busy === secondary.busyKey ? <LoadingEmojis size={12} gap={2} /> : secondary.label}
        </button>
      )}
    </div>
  );
}
