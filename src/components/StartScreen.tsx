'use client';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useSettings } from '@/hooks/useSettings';
import AuthBadge from './AuthBadge';
import NotificationBell from './NotificationBell';

const AnimatedBackground = dynamic(() => import('./AnimatedBackground'), { ssr: false });

interface Props {
  onStart: () => void;
  onOpenSettings?: () => void;
}

const PIECE_TYPES = ['lion', 'elephant', 'monkey', 'bat', 'butterfly', 'ant'] as const;
const PIECE_EMOJI_MAP: Record<typeof PIECE_TYPES[number], string> = {
  lion: '🦁', elephant: '🐘', monkey: '🐒', bat: '🦇', butterfly: '🦋', ant: '🐜',
};

export default function StartScreen({ onStart, onOpenSettings }: Props) {
  const { t, theme, isRTL } = useSettings();
  const [isMounted, setIsMounted] = useState(false);
  
  // Only render particles after mount to avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen flex flex-col items-center justify-start sm:justify-center px-3 sm:px-6 py-6 sm:py-8 pt-16 sm:pt-12 relative overflow-x-hidden overflow-y-auto"
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

      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8 relative z-10"
        style={{ textAlign: 'center', marginBottom: '2rem', position: 'relative', zIndex: 10 }}
      >
        {/* Crown animation */}
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className="text-5xl sm:text-6xl mb-4"
        >
          👑
        </motion.div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-2 px-1" style={{ fontWeight: 800, color: theme.p1Color, marginBottom: '0.5rem' }}>
          {t('app.title')}
        </h1>
        <p className="text-base sm:text-lg px-2" style={{ color: theme.textMuted }}>{t('app.subtitle')}</p>
        <p className="text-sm mt-1" style={{ color: theme.textMuted, fontSize: '0.875rem', marginTop: '0.25rem', opacity: 0.7 }}>{t('app.boardSummary')}</p>
      </motion.div>

      {/* Win conditions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mb-6 relative z-10 rounded-2xl p-4 max-w-lg w-full"
        style={{ marginBottom: '1.5rem', position: 'relative', zIndex: 10, background: theme.panelBg, borderRadius: '1rem', padding: '1rem', border: `1px solid ${theme.panelBorder}`, maxWidth: '32rem', width: '100%' }}
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

      {/* Piece guide */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-8 max-w-2xl w-full relative z-10"
        style={{ marginBottom: '2rem', maxWidth: '42rem', width: '100%', position: 'relative', zIndex: 10 }}
      >
        {PIECE_TYPES.map((type, i) => (
          <motion.div
            key={type}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i + 0.6 }}
            className="rounded-xl p-3 transition-colors"
            style={{ background: theme.panelBg, borderRadius: '0.75rem', padding: '0.75rem', border: `1px solid ${theme.panelBorder}` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{PIECE_EMOJI_MAP[type]}</span>
              <span className="font-bold text-sm" style={{ color: theme.textPrimary }}>{t(`piece.${type}`)}</span>
            </div>
            <p className="text-xs leading-snug" style={{ color: theme.textMuted }}>{t(`desc.${type}`)}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Board legend */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 sm:gap-6 mb-8 relative z-10 text-sm px-1"
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

      <div className="flex flex-col sm:flex-row gap-3 relative z-10 w-full max-w-md sm:max-w-none sm:w-auto">
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.1, type: 'spring' }}
        onClick={onStart}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="px-8 sm:px-10 py-3 sm:py-4 rounded-2xl text-lg sm:text-xl font-extrabold w-full sm:w-auto transition-all duration-300"
        style={{ position: 'relative', zIndex: 10, fontWeight: 800, color: '#000', background: `linear-gradient(to right, ${theme.p1Color}, ${theme.selectedRing}, ${theme.p1Color})`, boxShadow: `0 0 30px ${theme.p1Color}80` }}
      >
        {t('app.startButton')}
      </motion.button>

      <motion.a
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.2, type: 'spring' }}
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
        🌐 <span>{t('app.playOnline')}</span>
      </motion.a>
      </div>
    </div>
  );
}
