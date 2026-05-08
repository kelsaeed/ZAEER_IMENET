'use client';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Player } from '@/game/types';
import { useSettings } from '@/hooks/useSettings';
import { usePlayerThemes } from '@/hooks/usePlayerThemes';
import { format } from '@/game/locales';
import Confetti from './Confetti';

interface Props {
  winner: Player;
  onRestart: () => void;
  onMenu: () => void;
  onDismiss?: () => void;
  /** Optional turn count from the engine. When provided the share
   *  string includes "in N turns" so the result line carries a bit
   *  more bragging rights. */
  turn?: number;
}

export default function WinScreen({ winner, onRestart, onMenu, onDismiss, turn }: Props) {
  const { t } = useSettings();
  const playerThemes = usePlayerThemes();
  const isP1 = winner === 1;

  // Confetti palette: winner's accent on top of a festive multi-tint
  // mix so the field reads as "their colour, but a celebration".
  const winnerTheme = isP1 ? playerThemes.p1 : playerThemes.p2;
  const accent = isP1 ? winnerTheme.p1Color : winnerTheme.p2Color;
  const confettiColors = useMemo(() => ([
    accent,
    winnerTheme.throneBg,
    winnerTheme.selectedRing,
    '#ffffff',
    '#f472b6',
    '#a78bfa',
    '#34d399',
  ]), [accent, winnerTheme.throneBg, winnerTheme.selectedRing]);

  // Share line. Lives on the modal as a single tap-to-copy button so
  // a player who just won can fire the result at a friend without
  // leaving the result screen.
  const [copied, setCopied] = useState(false);
  const shareText = useMemo(() => {
    const url = typeof window !== 'undefined' ? window.location.origin : 'https://zaeer-imenet.vercel.app';
    const turnsLine = typeof turn === 'number' ? ` in ${turn} turns` : '';
    return `🏆 Won at Zaeer Imenet${turnsLine}! Play it: ${url}`;
  }, [turn]);

  async function handleShare() {
    // Native share sheet first (mobile), copy-to-clipboard fallback.
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText });
        return;
      }
    } catch {
      // User cancelled or share unavailable — fall through to copy.
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard blocked — silent */
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onDismiss}
      role={onDismiss ? 'button' : undefined}
      aria-label={onDismiss ? 'Close result and review the board' : undefined}
    >
      {/* Confetti rains from the top of the modal backdrop, behind
          the celebration card. pointer-events: none so it can't
          swallow the buttons underneath. */}
      <Confetti colors={confettiColors} />

      <motion.div
        initial={{ scale: 0.5, y: -60 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 15, stiffness: 200 }}
        onClick={(e) => e.stopPropagation()}
        className={`rounded-3xl p-5 sm:p-8 text-center max-w-md w-full mx-3 sm:mx-4 border-2 relative overflow-hidden ${
          isP1
            ? 'bg-gradient-to-br from-amber-950 to-yellow-900 border-amber-400'
            : 'bg-gradient-to-br from-blue-950 to-indigo-900 border-blue-400'
        }`}
        // max-h + overflow-y-auto so the modal scrolls instead of
        // overflowing on landscape mobile where viewport height is
        // ~375 px and there's a lot to show (crown + headline + 6
        // piece icons + 2 buttons + share + dismiss).
        style={{ zIndex: 2, maxHeight: '90dvh', overflowY: 'auto' }}
      >
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Close"
            className="absolute top-3 right-3 z-20 rounded-full w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        )}
        {/* Background glow */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: isP1
              ? 'radial-gradient(circle at center, #d4af37 0%, transparent 70%)'
              : 'radial-gradient(circle at center, #93c5fd 0%, transparent 70%)',
          }}
        />

        {/* Crown animation */}
        <motion.div
          animate={{ y: [0, -12, 0], rotate: [-5, 5, -5] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="text-5xl sm:text-7xl mb-4 relative z-10"
        >
          👑
        </motion.div>

        <div className="relative z-10">
          <h1 className={`text-2xl sm:text-4xl font-extrabold mb-2 ${isP1 ? 'text-amber-300' : 'text-blue-300'}`}>
            {t('win.victory')}
          </h1>
          <p className={`text-xl font-bold mb-1 ${isP1 ? 'text-amber-200' : 'text-blue-200'}`}>
            {format(t('win.playerWins'), { n: winner })}
          </p>
          <p className="text-slate-300 text-sm mb-2">
            {isP1 ? t('win.goldenLion') : t('win.silverLion')}
          </p>
          {typeof turn === 'number' && (
            <p className="text-slate-400 text-xs mb-6">
              {format(t('win.turnsTaken'), { n: turn })}
            </p>
          )}

          {/* Piece icons */}
          <motion.div
            className="flex flex-wrap justify-center gap-2 sm:gap-3 text-2xl sm:text-4xl mb-6 sm:mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            {['🦁', '🐘', '🐒', '🦇', '🦋', '🐜'].map((emoji, i) => (
              <motion.span
                key={i}
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 1.5, delay: i * 0.1, repeat: Infinity }}
              >
                {emoji}
              </motion.span>
            ))}
          </motion.div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center w-full max-w-xs sm:max-w-none mx-auto">
            <button
              onClick={onRestart}
              className={`px-6 py-3 rounded-xl font-bold text-black transition-all active:scale-95 min-h-[44px] ${
                isP1
                  ? 'bg-amber-400 hover:bg-amber-300'
                  : 'bg-blue-400 hover:bg-blue-300'
              }`}
            >
              {t('win.playAgain')}
            </button>
            <button
              onClick={onMenu}
              className="px-6 py-3 rounded-xl font-bold text-white border border-slate-500
                bg-slate-800/80 hover:bg-slate-700/80 transition-all active:scale-95 min-h-[44px]"
            >
              {t('win.mainMenu')}
            </button>
          </div>

          {/* Share button — uses navigator.share on mobile, falls back
              to clipboard. The transient "Copied!" pill replaces the
              label for ~2 s after a successful copy. */}
          <button
            onClick={handleShare}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-bold text-white/90 border border-white/25 hover:border-white/55 bg-white/5 hover:bg-white/10 transition-all active:scale-95"
          >
            {copied ? `✓ ${t('win.shareCopied')}` : `📤 ${t('win.share')}`}
          </button>

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="block mx-auto mt-3 text-sm opacity-70 hover:opacity-100 transition-opacity"
            >
              {t('win.reviewBoard')} →
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
