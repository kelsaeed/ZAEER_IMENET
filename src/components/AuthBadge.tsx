'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import LoadingEmojis from './LoadingEmojis';

interface Props {
  /** Render position. The page positions us absolutely; we just need the side. */
  side: 'left' | 'right';
}

export default function AuthBadge({ side }: Props) {
  const { user, profile, signOut, loading } = useUser();
  const { theme, t } = useSettings();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close the dropdown when clicking outside it.
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

  // While the user state is loading, show the looping emoji animation in
  // the badge slot so the user knows we're working — never render blank.
  if (loading) {
    return (
      <div
        className="rounded-full px-3 h-10 inline-flex items-center"
        style={{
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
        }}
        aria-label="Loading account"
      >
        <LoadingEmojis size={14} gap={2} />
      </div>
    );
  }

  // Not signed in — single "Sign in" button.
  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-full px-3 h-10 inline-flex items-center gap-2 font-semibold text-sm"
        style={{
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
          color: theme.textPrimary,
        }}
        aria-label={t('auth.signIn')}
      >
        <span>👤</span>
        <span className="hidden sm:inline">{t('auth.signIn')}</span>
      </Link>
    );
  }

  // Signed in — avatar/initial + dropdown.
  const initial = (profile?.display_name ?? user.email ?? '?').slice(0, 1).toUpperCase();

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="rounded-full h-10 px-2 inline-flex items-center gap-2 font-semibold text-sm"
        style={{
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
          color: theme.textPrimary,
        }}
      >
        <span
          className="rounded-full inline-flex items-center justify-center font-bold"
          style={{ width: 28, height: 28, background: theme.p1Color, color: '#000' }}
        >
          {initial}
        </span>
        <span className="hidden sm:inline pe-1">{profile?.display_name ?? user.email}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute mt-2 rounded-xl py-2 min-w-[200px] z-40"
            style={{
              [side]: 0,
              background: theme.bgGradient,
              border: `1px solid ${theme.panelBorder}`,
              color: theme.textPrimary,
            } as React.CSSProperties}
          >
            <div className="px-3 py-2 border-b" style={{ borderColor: theme.panelBorder }}>
              <div className="font-semibold text-sm truncate">{profile?.display_name}</div>
              <div className="text-xs opacity-70 truncate">@{profile?.username}</div>
              {profile?.is_admin && (
                <div className="text-xs mt-1" style={{ color: theme.p1Color }}>★ {t('auth.admin')}</div>
              )}
            </div>
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm hover:opacity-80"
            >
              {t('auth.profile')}
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                // Fire-and-forget: signOut clears local state synchronously
                // before awaiting Supabase, so the UI flips to "Sign in"
                // immediately even if the network request lags.
                signOut();
              }}
              className="w-full text-start px-3 py-2 text-sm hover:opacity-80 cursor-pointer"
            >
              {t('auth.signOut')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
