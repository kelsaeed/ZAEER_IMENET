'use client';
import { motion } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';
import LoadingEmojis from './LoadingEmojis';

interface Props {
  /** Optional small line of text below the spinner — e.g. "Loading lobby". */
  message?: string;
  /** Override the title shown under the crown. Default: app title. */
  title?: string;
  /** Hide the crown / title and just show the bouncing emojis. */
  compact?: boolean;
}

/** Full-screen splash used during route transitions, matchmaking, or any
 *  moment the system is initialising. Themed, on-brand, and just slow
 *  enough to feel intentional rather than broken. */
export default function GameLoadingScreen({ message, title, compact }: Props) {
  const { theme, t } = useSettings();
  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50 px-6"
      style={{ background: theme.bgGradient, color: theme.textPrimary }}
    >
      {!compact && (
        <>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{
              scale: 1,
              opacity: 1,
              y: [0, -12, 0],
              rotate: [-3, 3, -3],
            }}
            transition={{
              scale: { duration: 0.4, ease: 'easeOut' },
              opacity: { duration: 0.4 },
              y: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
              rotate: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
            }}
            className="text-6xl sm:text-7xl mb-3"
            style={{
              filter: `drop-shadow(0 0 18px ${theme.p1Color}80)`,
            }}
          >
            👑
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="text-2xl sm:text-3xl font-extrabold mb-4"
            style={{ color: theme.p1Color, letterSpacing: '0.02em' }}
          >
            {title ?? t('app.title')}
          </motion.h1>
        </>
      )}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <LoadingEmojis size={26} gap={6} />
      </motion.div>
      {message && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="text-sm mt-3"
        >
          {message}
        </motion.p>
      )}
    </div>
  );
}
