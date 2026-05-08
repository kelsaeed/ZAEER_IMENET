'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';

interface Props {
  /** True while the local player has an ant selected/moved with at
   *  least one valid rotation pending. Drives both the visibility
   *  and the entrance animation. */
  visible: boolean;
}

/** Mobile-only floating "look down" hint. On phones the rotation
 *  arrows + End-Turn button live in the HUD beneath the board, and
 *  first-time players didn't realize they had to scroll to find them
 *  after moving the ant. This bobbing pill at the bottom of the
 *  viewport tells them where to go.
 *
 *  Hidden at lg+ via Tailwind's lg:hidden — desktop already shows the
 *  HUD beside the board so no hint is needed. `pointer-events: none`
 *  so it never absorbs taps. */
export default function RotationHint({ visible }: Props) {
  const { theme, t, isRTL } = useSettings();

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="rotation-hint"
          dir={isRTL ? 'rtl' : 'ltr'}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.22 }}
          className="lg:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold pointer-events-none shadow-2xl"
          style={{
            background: theme.buttonRotateBg,
            border: `1px solid ${theme.buttonRotateBorder}`,
            color: theme.buttonRotateText,
            boxShadow: `0 4px 16px ${theme.buttonRotateBorder}`,
            maxWidth: 'calc(100vw - 24px)',
            whiteSpace: 'nowrap',
          }}
        >
          <span>{t('hint.rotateBelow')}</span>
          {/* Bobbing arrow draws the eye. Using framer-motion rather
              than a CSS keyframe so it shares the same animation
              budget the rest of the in-game UI uses (cheap on every
              platform we target). */}
          <motion.span
            aria-hidden
            animate={{ y: [0, 5, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
            className="text-lg leading-none"
          >
            ⬇
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
