'use client';
import { motion, AnimatePresence } from 'framer-motion';
import type { FlyingEmoji } from '@/hooks/useMatchReactions';

interface Props {
  flying: FlyingEmoji[];
  onComplete: (id: number) => void;
}

/** Full-viewport, pointer-events: none overlay that animates each
 *  reaction emoji upward and fades it out. The hook owns the queue;
 *  this component just renders + reports completion so the queue
 *  stays bounded. */
export default function FlyingEmojiOverlay({ flying, onComplete }: Props) {
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-50"
      style={{ pointerEvents: 'none', overflow: 'hidden' }}
    >
      <AnimatePresence>
        {flying.map(f => (
          <motion.div
            key={f.id}
            initial={{
              y: 0,
              opacity: 0,
              scale: 0.6,
              x: 0,
              rotate: -10,
            }}
            animate={{
              // ~70% of viewport height upward — feels lively without
              // pushing emojis off-screen on tall monitors.
              y: '-70vh',
              opacity: [0, 1, 1, 0],
              scale: [0.6, 1.25, 1, 0.85],
              // Gentle horizontal sway so a flurry feels organic.
              x: [0, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 40, 0],
              rotate: [-10, 8, -6, 0],
            }}
            transition={{
              duration: 2.6,
              ease: 'easeOut',
              opacity: { times: [0, 0.08, 0.7, 1], duration: 2.6 },
            }}
            onAnimationComplete={() => onComplete(f.id)}
            style={{
              position: 'absolute',
              bottom: '8vh',
              left: `${f.startXFrac * 100}%`,
              transform: 'translateX(-50%)',
              fontSize: 'clamp(28px, 5vw, 56px)',
              filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.35))',
              willChange: 'transform, opacity',
            }}
          >
            {f.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
