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
      className="min-h-screen flex flex-col items-center justify-start px-4 sm:px-6 relative overflow-x-hidden overflow-y-auto"
      style={{
        minHeight: '100dvh',
        position: 'relative',
        background: theme.bgGradient,
        color: theme.textPrimary,
        // Top-aligned hero: content starts high (clearing the fixed top bar)
        // instead of being dead-centred, which left huge empty bands above
        // and below on desktop. clamp keeps the offset comfortable across
        // viewport heights and on mobile.
        paddingTop: 'clamp(64px, 7.5vh, 100px)',
        paddingBottom: 'clamp(40px, 6vh, 80px)',
      }}
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

      {/* Subtle hero glow so the composition reads as an intentional,
          contained scene rather than a small island on a flat gradient. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: `radial-gradient(ellipse 70% 55% at 50% 40%, color-mix(in srgb, ${theme.p1Color} 12%, transparent), transparent 72%)` }}
      />

      {/* Main content — a wide two-column composition. Left: hero, rules,
          primary actions, secondary links. Right: the 6-card piece guide.
          The grid mirrors automatically for RTL and stacks below lg. The
          first-visit tour banner sits in-flow underneath, connected to the
          layout instead of floating at the viewport edge. */}
      <div className="w-full lg:max-w-7xl relative z-10 flex flex-col gap-6 sm:gap-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-7 sm:gap-8 lg:gap-10 xl:gap-14 items-center">
          {/* ── Left column ── */}
          <div className="flex flex-col items-center lg:items-stretch gap-5 sm:gap-6 w-full">
            <motion.div
              initial={{ opacity: 0, y: -24 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
              style={{ textAlign: 'center' }}
            >
              {/* Crown bob — pure CSS so it doesn't restart on parent re-renders.
                  See zi-crown-bob in globals.css. */}
              <div className="zi-crown-bob text-6xl sm:text-7xl mb-2" aria-hidden>
                👑
              </div>
              <h1 className="text-5xl sm:text-6xl xl:text-7xl font-extrabold mb-2 px-1" style={{ fontWeight: 800, color: theme.p1Color }}>
                {t('app.title')}
              </h1>
              <p className="text-lg sm:text-xl px-2" style={{ color: theme.textMuted }}>{t('app.subtitle')}</p>
              <p className="text-sm mt-1.5" style={{ color: theme.textMuted, opacity: 0.7 }}>{t('app.boardSummary')}</p>
            </motion.div>

            {/* Win conditions */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="rounded-2xl p-5 w-full max-w-lg lg:max-w-none"
              style={{ background: theme.panelBg, borderRadius: '1rem', border: `1px solid ${theme.panelBorder}`, width: '100%' }}
            >
              <h3 className="font-bold text-center mb-3" style={{ color: theme.p1Color, fontWeight: 700, textAlign: 'center', marginBottom: '0.75rem' }}>{t('win.title')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm" style={{ color: theme.textPrimary }}>
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

            {/* Primary actions — Offline (modal), Online (/play), Daily Puzzle.
                The hero CTAs: sized comfortably and spaced (gap-4) so they read
                as a confident action block, sharing the row equally (flex-1). */}
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md sm:max-w-none">
              <motion.button
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.24, duration: 0.3, ease: 'easeOut' }}
                onClick={() => setOfflineOpen(true)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="px-5 py-4 sm:py-5 rounded-2xl text-base sm:text-lg font-extrabold whitespace-nowrap w-full sm:flex-1 transition-all duration-300"
                style={{ fontWeight: 800, color: '#000', background: `linear-gradient(to right, ${theme.p1Color}, ${theme.selectedRing}, ${theme.p1Color})`, boxShadow: `0 0 30px ${theme.p1Color}80` }}
              >
                {t('app.offlineGame')}
              </motion.button>

              <motion.a
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32, duration: 0.3, ease: 'easeOut' }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                href="/play"
                className="px-5 py-4 sm:py-5 rounded-2xl text-base sm:text-lg font-extrabold whitespace-nowrap text-center w-full sm:flex-1 transition-all duration-300 flex items-center justify-center gap-2"
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
                transition={{ delay: 0.4, duration: 0.3, ease: 'easeOut' }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                href="/puzzle"
                className="px-5 py-4 sm:py-5 rounded-2xl text-base sm:text-lg font-extrabold whitespace-nowrap text-center w-full sm:flex-1 transition-all duration-300 flex items-center justify-center gap-2"
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

            {/* Board legend */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
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
              transition={{ delay: 0.58 }}
              className="flex flex-wrap gap-2.5 justify-center"
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
              {/* Theme Store pill — uses the buttonRotate accent so it pops
                  against every theme's background instead of blending into
                  the panelBg overlay. */}
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
              {/* View Story — opens a popup with the intro video. */}
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
          </div>

          {/* ── Right column: piece guide (6 cards) ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 w-full max-w-2xl lg:max-w-none mx-auto"
            style={{ width: '100%' }}
          >
            {PIECE_TYPES.map((type, i) => (
              <motion.div
                key={type}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 * i + 0.3 }}
                className="rounded-2xl p-5 transition-colors"
                style={{ background: theme.panelBg, borderRadius: '1rem', border: `1px solid ${theme.panelBorder}` }}
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="text-2xl sm:text-3xl">{PIECE_EMOJI_MAP[type]}</span>
                  <span className="font-bold text-base lg:text-lg" style={{ color: theme.textPrimary }}>{t(`piece.${type}`)}</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: theme.textMuted }}>{t(`desc.${type}`)}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* First-visit tour banner — in-flow, centred under the columns so
            it's connected to the layout instead of floating alone at the
            very bottom of the viewport. */}
        <AnimatePresence>
          {showTutorialToast && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.28 }}
              className="mx-auto px-4 py-3 rounded-2xl flex items-center gap-3 shadow-2xl"
              style={{
                background: theme.panelBg,
                border: `1px solid ${theme.p1Color}`,
                color: theme.textPrimary,
                maxWidth: 'min(100%, 32rem)',
                boxShadow: `0 14px 38px ${theme.p1Color}40`,
              }}
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
          )}
        </AnimatePresence>
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
    </div>
  );
}