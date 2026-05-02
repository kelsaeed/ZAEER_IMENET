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
  GameRow,
} from '@/lib/supabase/games';
import LoadingEmojis from '@/components/LoadingEmojis';
import AuthBadge from '@/components/AuthBadge';

interface PublicGame {
  id: string;
  player1_id: string;
  invite_code: string | null;
  created_at: string;
  player1: { username: string; display_name: string; avatar_url: string | null } | null;
}

export default function LobbyPage() {
  const router = useRouter();
  const { user, profile, loading: userLoading } = useUser();
  const { theme, t, isRTL } = useSettings();
  const [games, setGames] = useState<PublicGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');

  // Bounce unauthenticated visitors.
  useEffect(() => {
    if (!userLoading && !user) router.replace('/login?next=/play');
  }, [userLoading, user, router]);

  // Initial load + Realtime subscription so the lobby auto-refreshes when
  // someone creates/joins a public game.
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowser();
    let mounted = true;

    async function refresh() {
      const { data, error } = await supabase
        .from('games')
        .select('id, player1_id, invite_code, created_at, player1:profiles!games_player1_id_fkey(username, display_name, avatar_url)')
        .eq('status', 'waiting')
        .eq('is_public', true)
        .neq('player1_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!mounted) return;
      if (error) {
        setError(error.message);
      } else {
        setGames((data as unknown as PublicGame[]) ?? []);
        setError(null);
      }
      setLoading(false);
    }
    refresh();

    // Auto-refresh on any insert/update to games.
    const channel = supabase
      .channel('lobby')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games' },
        () => refresh(),
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleCreate = useCallback(async (isPublic: boolean) => {
    if (!user || creating) return;
    setError(null);
    setCreating(true);
    try {
      const game = await createOnlineGame({ userId: user.id, isPublic });
      router.push(`/play/${game.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not create game.');
      setCreating(false);
    }
  }, [user, creating, router]);

  const handleJoinPublic = useCallback(async (g: PublicGame) => {
    if (!user || joining) return;
    setError(null);
    setJoining(g.id);
    try {
      await joinOnlineGame({ userId: user.id, gameId: g.id });
      router.push(`/play/${g.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not join.');
      setJoining(null);
    }
  }, [user, joining, router]);

  const handleJoinByCode = useCallback(async () => {
    if (!user || !joinCode.trim()) return;
    setError(null);
    setJoining('code');
    try {
      const code = joinCode.trim().toUpperCase();
      const found = await findGameByInviteCode(code);
      if (!found) throw new Error('No game with that code.');
      if (found.player2_id && found.player2_id !== user.id) {
        throw new Error('That game is already full.');
      }
      if (found.player1_id === user.id) {
        // Re-entering your own waiting game.
        router.push(`/play/${found.id}`);
        return;
      }
      if (found.status === 'waiting') {
        await joinOnlineGame({ userId: user.id, gameId: found.id });
      }
      router.push(`/play/${found.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not join with that code.');
      setJoining(null);
    }
  }, [user, joinCode, router]);

  return (
    <main
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen px-4 py-10 sm:py-14"
      style={{ background: theme.bgGradient, color: theme.textPrimary }}
    >
      <div
        className="fixed top-3 z-30"
        style={{ [isRTL ? 'left' : 'right']: 12 } as React.CSSProperties}
      >
        <AuthBadge side={isRTL ? 'left' : 'right'} />
      </div>

      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm opacity-70 hover:opacity-100">
          ← {t('auth.backHome')}
        </Link>

        <h1
          className="text-3xl sm:text-4xl font-extrabold mt-3 mb-1"
          style={{ color: theme.p1Color }}
        >
          🌐 Online Lobby
        </h1>
        <p className="text-sm opacity-70 mb-6">
          Play with another human anywhere. Create a public room, share an invite code, or join an open match.
        </p>

        {/* Action row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <button
            onClick={() => handleCreate(true)}
            disabled={creating}
            className="rounded-xl p-4 font-semibold text-start hover:scale-[1.02] transition-transform disabled:opacity-50"
            style={{
              background: theme.buttonRotateBg,
              border: `1px solid ${theme.buttonRotateBorder}`,
              color: theme.buttonRotateText,
            }}
          >
            <div className="text-2xl mb-1">⚔️</div>
            <div className="text-sm font-bold">Create Public Game</div>
            <div className="text-xs opacity-80 mt-1">Anyone in the lobby can join.</div>
          </button>
          <button
            onClick={() => handleCreate(false)}
            disabled={creating}
            className="rounded-xl p-4 font-semibold text-start hover:scale-[1.02] transition-transform disabled:opacity-50"
            style={{
              background: theme.buttonSwitchBg,
              border: `1px solid ${theme.buttonSwitchBorder}`,
              color: theme.buttonSwitchText,
            }}
          >
            <div className="text-2xl mb-1">🔒</div>
            <div className="text-sm font-bold">Create Private Game</div>
            <div className="text-xs opacity-80 mt-1">Only friends with the invite code can join.</div>
          </button>
          <div
            className="rounded-xl p-4"
            style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
          >
            <div className="text-sm font-bold mb-2">🎟 Join with code</div>
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
                disabled={!joinCode.trim() || joining === 'code'}
                className="rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                style={{
                  background: theme.buttonRotateBg,
                  border: `1px solid ${theme.buttonRotateBorder}`,
                  color: theme.buttonRotateText,
                }}
              >
                {joining === 'code' ? <LoadingEmojis size={14} gap={2} /> : 'Go'}
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
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

        {/* Public games list */}
        <h2 className="text-lg font-bold mb-2">Open public games</h2>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <LoadingEmojis size={28} />
          </div>
        ) : games.length === 0 ? (
          <div
            className="rounded-xl p-6 text-center"
            style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
          >
            <div className="text-3xl mb-2">🪑</div>
            <div className="text-sm opacity-80">No one's hosting right now.</div>
            <div className="text-xs opacity-60 mt-1">Create a public game and someone will join in.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {games.map(g => (
              <motion.div
                key={g.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl p-3 flex items-center gap-3"
                style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
              >
                <div
                  className="rounded-full flex items-center justify-center font-bold shrink-0"
                  style={{
                    width: 40, height: 40,
                    background: theme.p2Color,
                    color: '#000',
                  }}
                >
                  {(g.player1?.display_name ?? '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{g.player1?.display_name ?? 'Anonymous'}</div>
                  <div className="text-xs opacity-70 truncate">@{g.player1?.username ?? '?'}</div>
                </div>
                <button
                  onClick={() => handleJoinPublic(g)}
                  disabled={joining === g.id}
                  className="rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center min-w-[80px]"
                  style={{
                    background: theme.buttonRotateBg,
                    border: `1px solid ${theme.buttonRotateBorder}`,
                    color: theme.buttonRotateText,
                  }}
                >
                  {joining === g.id ? <LoadingEmojis size={14} gap={2} /> : 'Join'}
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {profile && (
          <div className="text-xs opacity-50 mt-6 text-center">
            Signed in as @{profile.username}
          </div>
        )}
      </div>
    </main>
  );
}
