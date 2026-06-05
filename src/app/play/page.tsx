'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { createOnlineGame, quickMatch, GameMode } from '@/lib/supabase/games';
import type { TimeControl } from '@/game/types';
import OnlineCreateModal from '@/components/OnlineCreateModal';
import AuthBadge from '@/components/AuthBadge';
import NotificationBell from '@/components/NotificationBell';
import SettingsButton from '@/components/SettingsButton';
import { PlayTab } from './PlayTab';
import { FriendsTab } from './FriendsTab';

type LobbyTab = 'play' | 'friends';

export default function LobbyPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { user, profile, loading: userLoading } = useUser();
  const { theme, isRTL, t } = useSettings();
  // Initial tab respects ?tab=friends so the profile page's "Back to
  // friends" button lands the user where they came from.
  const [tab, setTab] = useState<LobbyTab>(() => (search?.get('tab') === 'friends' ? 'friends' : 'play'));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // The single "Create / Match" modal handles mode + timer + which button
  // (Quick Match / public / private). The lobby just holds open state.
  const [createOpen, setCreateOpen] = useState(false);

  // Bounce unauthenticated visitors.
  useEffect(() => {
    if (!userLoading && !user) router.replace('/login?next=/play');
  }, [userLoading, user, router]);

  // ── Modal callbacks ────────────────────────────────────────────────────
  const handleQuickMatch = useCallback(async (opts: { mode: GameMode; timeControl: TimeControl }) => {
    if (!user || busy) return;
    setError(null);
    setBusy('quick');
    setCreateOpen(false);
    try {
      const { gameId } = await quickMatch({ userId: user.id, mode: opts.mode, timeControl: opts.timeControl });
      router.push(`/play/${gameId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not start a quick match.');
      setBusy(null);
    }
  }, [user, busy, router]);

  const handleCreate = useCallback(async (opts: { mode: GameMode; timeControl: TimeControl; isPublic: boolean }) => {
    if (!user || busy) return;
    setError(null);
    setBusy(opts.isPublic ? 'public' : 'private');
    setCreateOpen(false);
    try {
      const game = await createOnlineGame({
        userId: user.id,
        isPublic: opts.isPublic,
        mode: opts.mode,
        timeControl: opts.timeControl,
      });
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
        <SettingsButton variant="inline" />
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
            onOpenCreate={() => setCreateOpen(true)}
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
            onChallenge={() => setCreateOpen(true)}
          />
        )}

        {profile && (
          <div className="text-xs opacity-50 mt-8 text-center">
            Signed in as @{profile.username}
          </div>
        )}
      </div>

      <OnlineCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onQuickMatch={handleQuickMatch}
        onCreate={handleCreate}
      />
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
