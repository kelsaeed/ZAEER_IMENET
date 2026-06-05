'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { listTopPlayers, type LeaderboardRow } from '@/lib/supabase/leaderboard';
import LoadingEmojis from '@/components/LoadingEmojis';
import Avatar from '@/components/Avatar';
import AuthBadge from '@/components/AuthBadge';
import NotificationBell from '@/components/NotificationBell';
import SettingsButton from '@/components/SettingsButton';

export default function LeaderboardPage() {
  const { user } = useUser();
  const { theme, isRTL, t } = useSettings();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    listTopPlayers(50)
      .then((r) => { if (mounted) setRows(r); })
      .catch((e) => { if (mounted) setError(e instanceof Error ? e.message : 'Could not load the leaderboard.'); });
    return () => { mounted = false; };
  }, []);

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
        <SettingsButton variant="inline" />
        <NotificationBell />
        <AuthBadge side={isRTL ? 'left' : 'right'} />
      </div>

      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm opacity-70 hover:opacity-100">
          ← {t('auth.backHome')}
        </Link>

        <h1 className="text-3xl sm:text-4xl font-extrabold mt-3 mb-1" style={{ color: theme.p1Color }}>
          🏆 Leaderboard
        </h1>
        <p className="text-sm opacity-70 mb-6">The top players, ranked by rating.</p>

        {error && (
          <div
            className="text-sm rounded-md px-3 py-2 mb-4"
            style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', color: '#fecaca' }}
          >
            {error}
          </div>
        )}

        {rows === null ? (
          <div className="flex items-center justify-center py-16"><LoadingEmojis size={28} /></div>
        ) : rows.length === 0 ? (
          <div className="text-sm opacity-60 py-12 text-center">
            No ranked games yet — play an online match to claim the top spot!
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const isMe = user?.id === r.id;
              const rank = i + 1;
              const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                >
                  <Link
                    href={`/u/${r.username}`}
                    className="rounded-xl p-3 flex items-center gap-3 transition-transform hover:scale-[1.01]"
                    style={{
                      background: isMe ? theme.p1AccentBg : theme.panelBg,
                      border: `1px solid ${isMe ? theme.p1Color : theme.panelBorder}`,
                    }}
                  >
                    <div className="w-9 text-center text-lg font-extrabold shrink-0" style={{ color: theme.p1Color }}>
                      {medal ?? <span className="text-sm opacity-80">#{rank}</span>}
                    </div>
                    <Avatar url={r.avatar_url} name={r.display_name} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate flex items-center gap-2">
                        <span className="truncate">{r.display_name}</span>
                        {isMe && (
                          <span
                            className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ background: theme.p1AccentBg, border: `1px solid ${theme.p1AccentBorder}`, color: theme.p1Color }}
                          >
                            YOU
                          </span>
                        )}
                      </div>
                      <div className="text-xs opacity-70 truncate">
                        @{r.username} · {r.wins}W / {r.losses}L{r.draws ? ` / ${r.draws}D` : ''}
                      </div>
                    </div>
                    <div className="font-extrabold shrink-0" style={{ color: theme.p1Color }}>★ {r.rating}</div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
