'use client';
import { motion } from 'framer-motion';

const ICONS = ['🦁', '🐘', '🐜', '🦋', '🦇', '🐒'] as const;

interface Props {
  /** Pixel size of each emoji. */
  size?: number;
  /** Gap between emojis. */
  gap?: number;
  /** Optional label rendered after the emojis. */
  label?: string;
}

/** A playful in-brand loading animation: the six game pieces bob up and down
 *  in a wave, looping forever. Used in auth flows so the user knows the
 *  request is in flight without reading "loading…". */
export default function LoadingEmojis({ size = 22, gap = 4, label }: Props) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'inline-flex', gap }} aria-hidden>
        {ICONS.map((e, i) => (
          <motion.span
            key={i}
            animate={{
              y: [0, -size * 0.3, 0],
              opacity: [0.35, 1, 0.35],
              scale: [0.92, 1, 0.92],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.13,
              ease: 'easeInOut',
            }}
            style={{ fontSize: size, lineHeight: 1 }}
          >
            {e}
          </motion.span>
        ))}
      </span>
      {label && <span className="text-sm opacity-80">{label}</span>}
    </span>
  );
}
