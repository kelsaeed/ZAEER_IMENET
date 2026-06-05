'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import {
  joinOnlineGame,
  findGameByInviteCode,
  listMyActiveGames,
  listAsyncOpenRooms,
  ActiveGame,
  AsyncOpenRoom,
} from '@/lib/supabase/games';
import { formatClockShort } from '@/game/timeControl';
import type { TimeControl } from '@/game/types';
import LoadingEmojis from '@/components/LoadingEmojis';
import Avatar from '@/components/Avatar';

export interface PublicGame {
  id: string;
  player1_id: string;
  time_control: TimeControl;
  player1: { username: string; display_name: string; avatar_url: string | null } | null;
}

export function PlayTab({
  theme, busy, onOpenCreate, setBusy, setError, user, router,
}: {
  theme: ReturnType<typeof useSettings>['theme'];
  busy: string | null;
  onOpenCreate: () => void;
  setBusy: (b: string | null) => void;
  setError: (e: string | null) => void;
  user: ReturnType<typeof useUser>['user'];
  router: ReturnType<typeof useRouter>;
}) {
  const { t } = useSettings();
  const [joinCode, setJoinCode] = useState('');
  const [games, setGames] = useState<PublicGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  // Open async (correspondence) rooms — separate panel so live players
  // looking for an instant match don't trip into a turn-a-day game.
  const [asyncRooms, setAsyncRooms] = useState<AsyncOpenRoom[]>([]);
  const [asyncLoading, setAsyncLoading] = useState(true);
  // Caller's in-progress games — surfaced at the top so a player who hit
  // Main Menu mid-match can hop right back in.
  const [active, setActive] = useState<ActiveGame[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    listMyActiveGames(user.id)
      .then(list => { if (mounted) setActive(list); })
      .catch(() => { if (mounted) setActive([]); });
    return () => { mounted = false; };
  }, [user]);

  // Live list of public open games (small section, collapsed). One channel
  // covers both the live and async lists — every games-table change just
  // re-runs both fetches.
  useEffect(() => {
    if (!user) return;
    const supabase = getSupabaseBrowser();
    let mounted = true;
    async function refresh() {
      const [{ data: liveData }, asyncList] = await Promise.all([
        supabase
          .from('games')
          .select('id, player1_id, time_control, player1:profiles!games_player1_id_fkey(username, display_name, avatar_url)')
          .eq('status', 'waiting')
          .eq('is_public', true)
          .eq('mode', 'live')
          .neq('player1_id', user!.id)
          .order('created_at', { ascending: false })
          .limit(20),
        listAsyncOpenRooms({ userId: user!.id }),
      ]);
      if (!mounted) return;
      setGames((liveData as unknown as PublicGame[]) ?? []);
      setGamesLoading(false);
      setAsyncRooms(asyncList);
      setAsyncLoading(false);
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
      {/* Resume strip — shown only when the caller has at least one match
          they can step back into. We deliberately put it ABOVE the hero
          actions so it's the first thing a returning player sees. */}
      {active && active.length > 0 && (
        <ResumeGames games={active} theme={theme} router={router} />
      )}

      {/* Two hero actions: open the create-modal (which packs Quick Match
          + public + private + live/async + timer) and the inline Join
          with Code. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <ActionCard
          icon="🎯"
          title="Find a Match"
          desc="Quick Match, public room, or private room — pick your time control on the next screen."
          accent
          loading={busy === 'quick' || busy === 'public' || busy === 'private'}
          theme={theme}
          onClick={onOpenCreate}
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

      {/* "Play Anytime" rooms — turn-based games that don't need both
          players to be online at once. Open by default; the "Play Now"
          list below stays collapsed because it churns fast. */}
      <details className="mb-4" open>
        <summary className="cursor-pointer text-sm font-semibold opacity-80 hover:opacity-100">
          📨 Play Anytime ({asyncLoading ? '…' : asyncRooms.length})
        </summary>
        <div className="mt-3">
          {asyncLoading ? (
            <div className="flex items-center justify-center py-6"><LoadingEmojis size={22} /></div>
          ) : asyncRooms.length === 0 ? (
            <div className="text-sm opacity-60 py-3 text-center">
              Nobody's set up a game yet. Be the first!
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {asyncRooms.map(g => (
                <motion.div
                  key={g.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl p-2.5 flex items-center gap-3"
                  style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
                >
                  <Avatar
                    url={g.player1?.avatar_url ?? null}
                    name={g.player1?.display_name ?? null}
                    size={36}
                    accent="p2"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate text-sm flex items-center gap-2">
                      {g.player1?.display_name ?? 'Anonymous'}
                      <span
                        className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{
                          background: theme.p1AccentBg,
                          border: `1px solid ${theme.p1AccentBorder}`,
                          color: theme.p1Color,
                        }}
                      >
                        ANYTIME
                      </span>
                    </div>
                    <div className="text-xs opacity-70 truncate">
                      @{g.player1?.username ?? '?'}
                      {g.player1?.rating != null ? ` · ★ ${g.player1.rating}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
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
                    }}
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

      {/* "Play Now" rooms — both players need to be online at once. */}
      <details className="mb-4">
        <summary className="cursor-pointer text-sm font-semibold opacity-80 hover:opacity-100">
          ⚡ Play Now ({gamesLoading ? '…' : games.length})
        </summary>
        <div className="mt-3">
          {gamesLoading ? (
            <div className="flex items-center justify-center py-6"><LoadingEmojis size={22} /></div>
          ) : games.length === 0 ? (
            <div className="text-sm opacity-60 py-3 text-center">Nobody's looking for a game right now.</div>
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
                    <div className="font-bold truncate text-sm flex items-center gap-2">
                      <span className="truncate">{g.player1?.display_name ?? 'Anonymous'}</span>
                      <TimeControlChip tc={g.time_control} theme={theme} t={t} />
                    </div>
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

/** Compact pill that shows a room's time control on lobby cards. The
 *  shape mirrors chess.com's "10+0" badge, with an `∞ Untimed` fallback
 *  when no clock is attached. Dropping a clock chip on every card means
 *  a player browsing rooms can pick a Bullet game vs. a Classical one
 *  without opening the room first. */
function TimeControlChip({ tc, theme, t }: { tc: TimeControl; theme: ReturnType<typeof useSettings>['theme']; t: (k: string, v?: Record<string, string | number>) => string }) {
  const isClock = tc.kind === 'clock';
  const label = isClock ? formatClockShort(tc) : t('timer.untimed');
  return (
    <span
      className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0 inline-flex items-center gap-1 font-mono"
      style={{
        background: isClock ? theme.p1AccentBg : theme.inputBg,
        border: `1px solid ${isClock ? theme.p1AccentBorder : theme.buttonBorder}`,
        color: isClock ? theme.p1Color : theme.textPrimary,
      }}
    >
      {isClock ? '⏱' : '∞'} <span>{label}</span>
    </span>
  );
}

/** Tiny relative-time helper used by the resume strip. Same idea as the
 *  one inside NotificationBell — kept local to avoid a shared util file
 *  for two places. */
function lobbyRel(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 45 * 1000) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
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

function ResumeGames({
  games, theme, router,
}: {
  games: ActiveGame[];
  theme: ReturnType<typeof useSettings>['theme'];
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <div
      className="rounded-2xl p-4 mb-5"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${theme.p1Color} 14%, ${theme.panelBg}), ${theme.panelBg})`,
        border: `1px solid ${theme.p1AccentBorder}`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-extrabold flex items-center gap-2" style={{ color: theme.p1Color }}>
          <span aria-hidden>🎮</span>
          <span>Pick up where you left off</span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-bold"
            style={{
              background: theme.p1AccentBg,
              border: `1px solid ${theme.p1AccentBorder}`,
              color: theme.p1Color,
            }}
          >
            {games.length}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {games.map(g => {
          const oppName = g.opponent?.display_name ?? (g.status === 'waiting' ? 'Waiting…' : 'Opponent');
          const accent = g.myPlayer === 1 ? 'p1' : 'p2';
          const accentColor = g.myPlayer === 1 ? theme.p1Color : theme.p2Color;
          return (
            <button
              key={g.id}
              onClick={() => router.push(`/play/${g.id}`)}
              className="rounded-xl p-3 flex items-center gap-3 text-start transition-transform hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: theme.inputBg,
                border: `1px solid ${g.myTurn ? accentColor : theme.buttonBorder}`,
                boxShadow: g.myTurn ? `0 0 0 2px color-mix(in srgb, ${accentColor} 40%, transparent)` : 'none',
              }}
            >
              <Avatar
                url={g.opponent?.avatar_url ?? null}
                name={g.opponent?.display_name ?? null}
                size={40}
                accent={accent}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate flex items-center gap-2">
                  <span className="truncate">vs {oppName}</span>
                  {g.mode === 'async' && (
                    <span
                      className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0"
                      style={{
                        background: theme.p1AccentBg,
                        border: `1px solid ${theme.p1AccentBorder}`,
                        color: theme.p1Color,
                      }}
                    >
                      ASYNC
                    </span>
                  )}
                </div>
                <div className="text-xs opacity-75 truncate flex items-center gap-2">
                  {g.status === 'waiting' ? (
                    <>⏳ Waiting for opponent</>
                  ) : g.myTurn ? (
                    <span style={{ color: accentColor, fontWeight: 700 }}>● Your turn</span>
                  ) : g.mode === 'async' && g.last_move_at ? (
                    <>Opponent moved {lobbyRel(g.last_move_at)}</>
                  ) : (
                    <>Turn {g.current_turn}</>
                  )}
                </div>
              </div>
              <span aria-hidden style={{ color: accentColor }}>↗</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
