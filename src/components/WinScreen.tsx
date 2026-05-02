'use client';
import { motion } from 'framer-motion';
import { Player } from '@/game/types';
import { useSettings } from '@/hooks/useSettings';
import { format } from '@/game/locales';

interface Props {
  winner: Player;
  onRestart: () => void;
  onMenu: () => void;
}

export default function WinScreen({ winner, onRestart, onMenu }: Props) {
  const { t } = useSettings();
  const isP1 = winner === 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
    >
      <motion.div
        initial={{ scale: 0.5, y: -60 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 15, stiffness: 200 }}
        className={`rounded-3xl p-6 sm:p-10 text-center max-w-md w-full mx-3 sm:mx-4 border-2 relative overflow-hidden ${
          isP1
            ? 'bg-gradient-to-br from-amber-950 to-yellow-900 border-amber-400'
            : 'bg-gradient-to-br from-blue-950 to-indigo-900 border-blue-400'
        }`}
      >
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
          <p className="text-slate-300 text-sm mb-8">
            {isP1 ? t('win.goldenLion') : t('win.silverLion')}
          </p>

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
        </div>
      </motion.div>
    </motion.div>
  );
}
