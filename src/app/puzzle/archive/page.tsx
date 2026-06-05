'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import LoadingEmojis from '@/components/LoadingEmojis';
import AuthBadge from '@/components/AuthBadge';
import NotificationBell from '@/components/NotificationBell';
import SettingsButton from '@/components/SettingsButton';

interface ArchivePuzzle {
  id: string;
  puzzle_date: string;
  difficulty: number;
  theme: string | null;
  title_en: string | null;
  title_ar: string | null;
  available: boolean;
  status: 'solved' | 'gave-up' | 'unsolved';
  wrong_moves: number;
}

export default function PuzzleArchivePage() {
  const { user, loading: userLoading } = useUser();
  const { theme, isRTL, t, localeId } = useSettings();
  const [puzzles, setPuzzles] = useState<ArchivePuzzle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const fetchPage = useCallback(async (from: number) => {
    const res = await fetch(`/api/puzzles/archive?offset=${from}&limit=30`);
    if (res.status === 401) throw new Error('unauthorized');
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<{ puzzles: ArchivePuzzle[]; hasMore: boolean; nextOffset: number }>;
  }, []);

  useEffect(() => {
    if (userLoading) return;
    if (!user) { setPuzzles([]); return; }
    let mounted = true;
    fetchPage(0)
      .then(data => {
        if (!mounted) return;
        setPuzzles(data.puzzles);
        setHasMore(data.hasMore);
        setOffset(data.nextOffset);
      })
      .catch(e => { if (mounted) setError(e instanceof Error ? e.message : 'Could not load the archive.'); });
    return () => { mounted = false; };
  }, [user, userLoading, fetchPage]);

  const onLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const data = await fetchPage(offset);
      setPuzzles(prev => [...(prev ?? []), ...data.puzzles]);
      setHasMore(data.hasMore);
      setOffset(data.nextOffset);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load more.');
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, offset]);

  const statusMeta = (status: ArchivePuzzle['status']) => {
    switch (status) {
      case 'solved': return { emoji: '✅', label: t('puzzle.archive.solved'), color: theme.p1Color, border: theme.p1AccentBorder, bg: theme.p1AccentBg };
      case 'gave-up': return { emoji: '🏳️', label: t('puzzle.archive.gaveUp'), color: theme.p2Color, border: theme.p2AccentBorder, bg: theme.p2AccentBg };
      default: return { emoji: '·', label: t('puzzle.archive.unsolved'), color: theme.textMuted, border: theme.panelBorder, bg: theme.panelBg };
    }
  };

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
        <Link href="/puzzle" className="text-sm opacity-70 hover:opacity-100">
          ← {t('puzzle.title')}
        </Link>

        <h1 className="text-3xl sm:text-4xl font-extrabold mt-3 mb-1" style={{ color: theme.p1Color }}>
          🗂️ {t('puzzle.archive.title')}
        </h1>
        <p className="text-sm opacity-70 mb-6">{t('puzzle.archive.subtitle')}</p>

        {error && (
          <div
            className="text-sm rounded-md px-3 py-2 mb-4"
            style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', color: '#fecaca' }}
          >
            {error}
          </div>
        )}

        {!userLoading && !user ? (
          <div className="rounded-2xl p-6 text-center" style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}>
            <p style={{ marginBottom: 12 }}>{t('puzzle.signInToPlay')}</p>
            <Link
              href="/login"
              style={{
                display: 'inline-block', padding: '8px 18px', borderRadius: 12,
                background: theme.p1AccentBg, border: `1px solid ${theme.p1AccentBorder}`,
                color: theme.p1Color, fontWeight: 700,
              }}
            >
              {t('puzzle.signIn')}
            </Link>
          </div>
        ) : puzzles === null ? (
          <div className="flex items-center justify-center py-16"><LoadingEmojis size={28} /></div>
        ) : puzzles.length === 0 ? (
          <div className="text-sm opacity-60 py-12 text-center">{t('puzzle.archive.empty')}</div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {puzzles.map((p, i) => {
                const meta = statusMeta(p.status);
                const title = localeId === 'ar' && p.title_ar ? p.title_ar : (p.title_en ?? '');
                const isToday = p.puzzle_date === today;
                const card = (
                  <div
                    className="rounded-xl p-3 flex items-center gap-3 h-full"
                    style={{
                      background: p.status === 'solved' ? theme.p1AccentBg : theme.panelBg,
                      border: `1px solid ${p.status === 'solved' ? theme.p1Color : theme.panelBorder}`,
                      opacity: p.available ? 1 : 0.55,
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-lg"
                      style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}
                      aria-label={meta.label}
                      title={meta.label}
                    >
                      {meta.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate flex items-center gap-2">
                        <span className="truncate">{title || `${'★'.repeat(p.difficulty)}`}</span>
                        {isToday && (
                          <span
                            className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ background: theme.p1AccentBg, border: `1px solid ${theme.p1AccentBorder}`, color: theme.p1Color }}
                          >
                            {t('puzzle.archive.today')}
                          </span>
                        )}
                      </div>
                      <div className="text-xs opacity-70 truncate">
                        {p.puzzle_date} · {'★'.repeat(p.difficulty)}{p.theme ? ` · ${p.theme}` : ''}
                      </div>
                    </div>
                    <div className="text-xs shrink-0" style={{ color: meta.color }}>
                      {p.available ? meta.label : t('puzzle.archive.unavailable')}
                    </div>
                  </div>
                );
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  >
                    {p.available ? (
                      <Link href={`/puzzle/${p.id}`} className="block transition-transform hover:scale-[1.01]">
                        {card}
                      </Link>
                    ) : (
                      <div className="cursor-not-allowed">{card}</div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-5">
                <button
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="rounded-full px-5 py-2 text-sm font-bold transition-transform hover:scale-105 disabled:opacity-50"
                  style={{ background: theme.panelBg, border: `1px solid ${theme.p1AccentBorder}`, color: theme.p1Color }}
                >
                  {loadingMore ? '…' : t('puzzle.archive.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
