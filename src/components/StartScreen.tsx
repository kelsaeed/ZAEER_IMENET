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
import StoryModal from './StoryModal';

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
  const [storyOpen, setStoryOpen] = useState(false);
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

      {/* Main content. On lg+ it splits into two balanced columns: the
          title, rules, legend, secondary links, and primary actions stack
          on the left; the 6-card piece guide fills the right. Below lg it's
          a single centered column. The flex layout mirrors automatically
          for RTL. */}
      <div
        className="
          w-full relative z-10 flex flex-col items-center gap-7 sm:gap-8
          lg:flex-row lg:items-center lg:justify-center lg:gap-12 xl:gap-16
          lg:max-w-7xl xl:max-w-[88rem]
        "
      >
        {/* ── Left column ─────────────────────────────────────────── */}
        <div className="flex flex-col items-center lg:items-stretch gap-5 sm:gap-6 w-full lg:flex-1 lg:max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
            style={{ textAlign: 'center' }}
          >
            {/* Crown bob — pure CSS so it doesn't restart on parent re-renders.
                See zi-crown-bob in globals.css. */}
            <div className="zi-crown-bob text-5xl sm:text-6xl xl:text-7xl mb-3" aria-hidden>
              👑
            </div>
            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-extrabold mb-2 px-1" style={{ fontWeight: 800, color: theme.p1Color }}>
              {t('app.title')}
            </h1>
            <p className="text-base sm:text-lg xl:text-xl px-2" style={{ color: theme.textMuted }}>{t('app.subtitle')}</p>
            <p className="text-sm mt-1" style={{ color: theme.textMuted, opacity: 0.7 }}>{t('app.boardSummary')}</p>
          </motion.div>

          {/* Win conditions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl p-4 sm:p-5 w-full max-w-lg lg:max-w-none"
            style={{ background: theme.panelBg, borderRadius: '1rem', border: `1px solid ${theme.panelBorder}`, width: '100%' }}
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

          {/* Board legend */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm px-1"
          >
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded shrink-0" style={{ background: theme.throneBg, border: `1px solid ${theme.throneBorder}` }} />
              <span style={{ color: theme.textMuted }}>{t('legend.throne')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded shrink-0" style={{ background: theme.barrierBg, border: `1px solid ${theme.barrierBorder}` }} />
              <span style={{ color: theme.textMuted }}>{t('legend.barrier')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full shrink-0" style={{ background: theme.validMoveFill, border: `2px solid ${theme.validMoveBorder}` }} />
              <span style={{ color: theme.textMuted }}>{t('legend.validMove')}</span>
            </div>
          </motion.div>

          {/* Secondary links — tutorial, theme store, view story. */}
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0 }}
            className="flex flex-wrap gap-2 justify-center"
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
            {/* View Story — opens a popup with the intro video. Uses the
                same bright buttonRotate styling as Theme Store so it
                reads as a sibling CTA, not a faded afterthought. */}
            <button
              type="button"
              onClick={() => setStoryOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-transform hover:scale-105 active:scale-95"
              style={{
                background: theme.buttonRotateBg,
                border: `1px solid ${theme.buttonRotateBorder}`,
                color: theme.buttonRotateText,
                boxShadow: `0 4px 14px ${theme.buttonRotateBorder}`,
              }}
            >
              🎬 View Story
            </button>
          </motion.div>

          {/* Primary actions — Offline (modal), Online (/play), Daily Puzzle.
              They share the row equally (flex-1) so the row reads as a
              confident block of CTAs rather than three small pills. */}
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md sm:max-w-none mt-1">
            <motion.button
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1, duration: 0.35, ease: 'easeOut' }}
              onClick={() => setOfflineOpen(true)}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="px-5 py-3.5 rounded-2xl text-base sm:text-lg font-extrabold w-full sm:flex-1 transition-all duration-300"
              style={{ fontWeight: 800, color: '#000', background: `linear-gradient(to right, ${theme.p1Color}, ${theme.selectedRing}, ${theme.p1Color})`, boxShadow: `0 0 30px ${theme.p1Color}80` }}
            >
              {t('app.offlineGame')}
            </motion.button>

            <motion.a
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.35, ease: 'easeOut' }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              href="/play"
              className="px-5 py-3.5 rounded-2xl text-base sm:text-lg font-extrabold text-center w-full sm:flex-1 transition-all duration-300 flex items-center justify-center gap-2"
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
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              href="/puzzle"
              className="px-5 py-3.5 rounded-2xl text-base sm:text-lg font-extrabold text-center w-full sm:flex-1 transition-all duration-300 flex items-center justify-center gap-2"
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

        {/* ── Right column: piece guide (6 cards) ─────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full max-w-2xl lg:max-w-xl lg:flex-1"
          style={{ width: '100%' }}
        >
          {PIECE_TYPES.map((type, i) => (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * i + 0.55 }}
              className="rounded-xl p-4 transition-colors"
              style={{ background: theme.panelBg, borderRadius: '0.75rem', border: `1px solid ${theme.panelBorder}` }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-2xl">{PIECE_EMOJI_MAP[type]}</span>
                <span className="font-bold text-sm lg:text-base" style={{ color: theme.textPrimary }}>{t(`piece.${type}`)}</span>
              </div>
              <p className="text-xs lg:text-sm leading-snug" style={{ color: theme.textMuted }}>{t(`desc.${type}`)}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <OfflineGameModal
        open={offlineOpen}
        onClose={() => setOfflineOpen(false)}
        onStart={(aiLevel, tc) => {
          setOfflineOpen(false);
          onStart(aiLevel, tc);
        }}
      />

      {/* Story video popup, controlled by the View Story pill. */}
      <StoryModal open={storyOpen} onClose={() => setStoryOpen(false)} />

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