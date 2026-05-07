'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSettings } from '@/hooks/useSettings';
import type { AiLevel, TimeControl } from '@/game/types';
import AuthBadge from './AuthBadge';
import NotificationBell from './NotificationBell';
import OfflineGameModal from './OfflineGameModal';

const AnimatedBackground = dynamic(() => import('./AnimatedBackground'), { ssr: false });

interface Props {
  /** Pass null for local pass-and-play, or an AI level. The second arg is
   *  the time control chosen in the offline modal — `{kind:'none'}` when
   *  the timer toggle is off. */
  onStart: (aiLevel: AiLevel | null, timeControl: TimeControl) => void;
  onOpenSettings?: () => void;
}

const PIECE_TYPES = ['lion', 'elephant', 'monkey', 'bat', 'butterfly', 'ant'] as const;
const PIECE_EMOJI_MAP: Record<typeof PIECE_TYPES[number], string> = {
  lion: '🦁', elephant: '🐘', monkey: '🐒', bat: '🦇', butterfly: '🦋', ant: '🐜',
};

export default function StartScreen({ onStart, onOpenSettings }: Props) {
  const { t, theme, isRTL } = useSettings();
  const [isMounted, setIsMounted] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  // First-load tutorial nudge — small dismissable toast for users who've
  // never opened the tour. Visiting /tutorial sets the flag, so anyone
  // who's already taken (or skipped) the tour stops seeing this.
  const [showTutorialToast, setShowTutorialToast] = useState(false);

  // Only render particles after mount to avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
      try {
        if (!window.localStorage.getItem('zaeer.tutorialSeen')) {
          setShowTutorialToast(true);
        }
      } catch { /* ignore */ }
    }
  }, []);

  function dismissTutorialToast() {
    setShowTutorialToast(false);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('zaeer.tutorialSeen', '1'); } catch { /* ignore */ }
    }
  }

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen flex flex-col items-center justify-start sm:justify-center px-3 sm:px-6 py-6 sm:py-8 pt-16 sm:pt-12 lg:pt-16 relative overflow-x-hidden overflow-y-auto"
      style={{ minHeight: '100dvh', position: 'relative', background: theme.bgGradient, color: theme.textPrimary }}
    >
      {/* Top bar: settings on one side, auth badge on the other. */}
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="fixed top-3 z-30 rounded-full text-xl flex items-center justify-center transition-transform hover:scale-110"
          style={{
            [isRTL ? 'right' : 'left']: 12,
            width: 40, height: 40,
            background: theme.panelBg,
            border: `1px solid ${theme.panelBorder}`,
            color: theme.textPrimary,
          } as React.CSSProperties}
        >
          ⚙️
        </button>
      )}
      <div
        className="fixed top-3 z-30 flex items-center gap-2"
        style={{ [isRTL ? 'left' : 'right']: 12 } as React.CSSProperties}
      >
        <NotificationBell />
        <AuthBadge side={isRTL ? 'left' : 'right'} />
      </div>
      {/* Background: bouncing emojis (canvas) */}
      {isMounted && <AnimatedBackground />}

      {/* On lg+ everything reflows into a 2-column grid: title + rules +
          legend + buttons stack on the left, the 6-card piece guide
          fills the right column. */}
      <div
        className="
          flex flex-col items-center w-full relative z-10 gap-0
          lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-x-10 lg:gap-y-0
          lg:max-w-6xl lg:items-center lg:justify-items-center
        "
      >
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8 lg:mb-4 lg:col-start-1 lg:row-start-1 lg:self-end"
          style={{ textAlign: 'center' }}
        >
          {/* Crown bob — pure CSS so it doesn't restart on parent re-renders.
              See zi-crown-bob in globals.css. */}
          <div className="zi-crown-bob text-5xl sm:text-6xl mb-4" aria-hidden>
            👑
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-2 px-1" style={{ fontWeight: 800, color: theme.p1Color }}>
            {t('app.title')}
          </h1>
          <p className="text-base sm:text-lg px-2" style={{ color: theme.textMuted }}>{t('app.subtitle')}</p>
          <p className="text-sm mt-1" style={{ color: theme.textMuted, opacity: 0.7 }}>{t('app.boardSummary')}</p>
        </motion.div>

        {/* Win conditions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mb-6 lg:mb-4 rounded-2xl p-4 max-w-lg w-full lg:col-start-1 lg:row-start-2"
          style={{ background: theme.panelBg, borderRadius: '1rem', padding: '1rem', border: `1px solid ${theme.panelBorder}`, maxWidth: '32rem', width: '100%' }}
        >
          <h3 className="font-bold text-center mb-3" style={{ color: theme.p1Color, fontWeight: 700, textAlign: 'center', marginBottom: '0.75rem' }}>{t('win.title')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm" style={{ color: theme.textPrimary }}>
            <div className="flex items-start gap-2">
              <span>👑</span>
              <span>{t('win.lionThrone')}</span>
            </div>
            <div className="flex items-start gap-2">
              <span>💀</span>
              <span>{t('win.killLions')}</span>
            </div>
          </div>
        </motion.div>

        {/* Piece guide — 6 cards. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="
            grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2
            gap-3 mb-8 lg:mb-0 max-w-2xl w-full
            lg:col-start-2 lg:row-start-1 lg:row-span-4 lg:self-center
          "
          style={{ maxWidth: '42rem', width: '100%' }}
        >
          {PIECE_TYPES.map((type, i) => (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i + 0.6 }}
              className="rounded-xl p-3 lg:p-4 transition-colors"
              style={{ background: theme.panelBg, borderRadius: '0.75rem', border: `1px solid ${theme.panelBorder}` }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{PIECE_EMOJI_MAP[type]}</span>
                <span className="font-bold text-sm lg:text-base" style={{ color: theme.textPrimary }}>{t(`piece.${type}`)}</span>
              </div>
              <p className="text-xs lg:text-sm leading-snug" style={{ color: theme.textMuted }}>{t(`desc.${type}`)}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Board legend */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 sm:gap-6 mb-8 lg:mb-4 text-sm px-1 lg:col-start-1 lg:row-start-3 lg:justify-self-center"
        >
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded" style={{ background: theme.throneBg, border: `1px solid ${theme.throneBorder}` }} />
            <span style={{ color: theme.textMuted }}>{t('legend.throne')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded" style={{ background: theme.barrierBg, border: `1px solid ${theme.barrierBorder}` }} />
            <span style={{ color: theme.textMuted }}>{t('legend.barrier')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full" style={{ background: theme.validMoveFill, border: `2px solid ${theme.validMoveBorder}` }} />
            <span style={{ color: theme.textMuted }}>{t('legend.validMove')}</span>
          </div>
        </motion.div>

        {/* Tutorial entry — small, sits above the two hero buttons so
            first-timers see it without crowding the main CTAs. */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="mb-3 lg:mb-2 lg:col-start-1 lg:row-start-4 lg:row-end-4 lg:self-end lg:justify-self-center flex flex-wrap gap-2 justify-center"
        >
          <Link
            href="/tutorial"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-transform hover:scale-105 active:scale-95"
            style={{
              background: theme.panelBg,
              border: `1px solid ${theme.p1AccentBorder}`,
              color: theme.p1Color,
            }}
          >
            {t('tutorial.button')}
          </Link>
          {/* Theme Store pill — uses the buttonRotate accent (the same
              theme-driven gold/amber/white-on-black palette as the
              "active tab" pill in SettingsPanel) so it pops against
              every theme's background instead of blending into the
              panelBg overlay. */}
          <Link
            href="/store"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-transform hover:scale-105 active:scale-95"
            style={{
              background: theme.buttonRotateBg,
              border: `1px solid ${theme.buttonRotateBorder}`,
              color: theme.buttonRotateText,
              boxShadow: `0 4px 14px ${theme.buttonRotateBorder}`,
            }}
          >
            {t('app.themeStore')}
          </Link>
        </motion.div>

        {/* Two hero buttons: Online (routes to /play) + Offline (opens
            modal with mode picker + timer). The mode picker pills that
            used to live above this row moved into the offline modal. */}
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md sm:max-w-none sm:w-auto lg:col-start-1 lg:row-start-5 lg:self-start">
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.1, duration: 0.35, ease: 'easeOut' }}
            onClick={() => setOfflineOpen(true)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="px-8 sm:px-10 py-3 sm:py-4 rounded-2xl text-lg sm:text-xl font-extrabold w-full sm:w-auto transition-all duration-300"
            style={{ fontWeight: 800, color: '#000', background: `linear-gradient(to right, ${theme.p1Color}, ${theme.selectedRing}, ${theme.p1Color})`, boxShadow: `0 0 30px ${theme.p1Color}80` }}
          >
            {t('app.offlineGame')}
          </motion.button>

          <motion.a
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2, duration: 0.35, ease: 'easeOut' }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            href="/play"
            className="px-8 sm:px-10 py-3 sm:py-4 rounded-2xl text-lg sm:text-xl font-extrabold text-center w-full sm:w-auto transition-all duration-300 flex items-center justify-center gap-2"
            style={{
              fontWeight: 800,
              color: theme.textPrimary,
              background: theme.panelBg,
              border: `1px solid ${theme.p2AccentBorder}`,
              backdropFilter: 'blur(8px)',
            }}
          >
            <span>{t('app.onlineGame')}</span>
          </motion.a>

          <motion.a
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.3, duration: 0.35, ease: 'easeOut' }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            href="/puzzle"
            className="px-8 sm:px-10 py-3 sm:py-4 rounded-2xl text-lg sm:text-xl font-extrabold text-center w-full sm:w-auto transition-all duration-300 flex items-center justify-center gap-2"
            style={{
              fontWeight: 800,
              color: theme.textPrimary,
              background: theme.panelBg,
              border: `1px solid ${theme.p1AccentBorder}`,
              backdropFilter: 'blur(8px)',
            }}
          >
            <span>{t('app.dailyPuzzle')}</span>
          </motion.a>
        </div>
      </div>

      <OfflineGameModal
        open={offlineOpen}
        onClose={() => setOfflineOpen(false)}
        onStart={(aiLevel, tc) => {
          setOfflineOpen(false);
          onStart(aiLevel, tc);
        }}
      />

      {/* First-load nudge toward the tutorial. Doesn't block anything —
          just floats at the bottom of the screen until the user opens
          the tutorial or hits the dismiss ✕. The flag is also set when
          the tutorial page mounts, so a casual peek counts as seen. */}
      <AnimatePresence>
        {showTutorialToast && (
          // Two-layer setup so framer-motion's animate.y can write to
          // `transform` without clobbering the centering translation.
          // Outer fixed wrapper centres horizontally with
          // `left: 50%; translateX(-50%)`; inner motion.div only owns
          // opacity + y. An earlier single-layer version got pulled to
          // the right edge on mobile because framer's translateY(0)
          // erased the translateX(-50%).
          <div
            className="fixed bottom-4 z-30"
            style={{
              left: '50%',
              transform: 'translateX(-50%)',
              maxWidth: 'calc(100vw - 24px)',
              width: 'max-content',
            }}
          >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.28 }}
            className="px-4 py-3 rounded-2xl flex items-center gap-3 shadow-2xl"
            style={{
              background: theme.panelBg,
              border: `1px solid ${theme.p1Color}`,
              color: theme.textPrimary,
              maxWidth: '100%',
              boxShadow: `0 14px 38px ${theme.p1Color}40`,
            } as React.CSSProperties}
          >
            <Link
              href="/tutorial"
              className="text-sm font-bold whitespace-nowrap"
              style={{ color: theme.p1Color }}
              onClick={dismissTutorialToast}
            >
              {t('tutorial.toast')}
            </Link>
            <button
              type="button"
              onClick={dismissTutorialToast}
              aria-label={t('tutorial.toastDismiss')}
              className="rounded-full w-7 h-7 inline-flex items-center justify-center text-xs opacity-70 hover:opacity-100 shrink-0"
              style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}`, color: theme.textPrimary }}
            >
              ✕
            </button>
          </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
