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
 *  stays bounded.
 *
 *  Emojis are positioned by sender so each player can tell theirs
 *  apart from the opponent's at a glance:
 *    • own (fromMe)    — start near the bottom of the viewport (your
 *                         side), float up across the board.
 *    • peer (!fromMe)  — start near the top of the viewport (opponent
 *                         side), float up off the screen quickly. */
export default function FlyingEmojiOverlay({ flying, onComplete }: Props) {
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-50"
      style={{ pointerEvents: 'none', overflow: 'hidden' }}
    >
      <AnimatePresence>
        {flying.map(f => {
          // Two distinct trajectories. Own emojis travel further so the
          // sender gets a satisfying "cheer flying up" feel; peer emojis
          // stay shorter so they read as "from above" without colliding
          // with your own flurry below.
          const ownStartBottomVh = 8;
          const ownTravelVh = 70;
          const peerStartTopVh = 12;
          const peerTravelVh = 18;

          const positionStyle: React.CSSProperties = f.fromMe
            ? { bottom: `${ownStartBottomVh}vh` }
            : { top: `${peerStartTopVh}vh` };
          const targetY = f.fromMe ? `-${ownTravelVh}vh` : `-${peerTravelVh}vh`;

          return (
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
                y: targetY,
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
                ...positionStyle,
                left: `${f.startXFrac * 100}%`,
                transform: 'translateX(-50%)',
                fontSize: 'clamp(28px, 5vw, 56px)',
                filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.35))',
                willChange: 'transform, opacity',
              }}
            >
              {f.emoji}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
