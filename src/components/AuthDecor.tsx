'use client';
import { motion } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';
import { PIECE_EMOJI } from '@/game/constants';
import type { PieceType } from '@/game/types';

// All animation/transition objects are module-level for stable references —
// inline literals would make framer-motion restart the loops every time the
// parent re-renders. Same trick used in PieceDisplay / BoardCell.

const PARADE_ORDER: PieceType[] = ['lion', 'elephant', 'monkey', 'butterfly', 'bat', 'ant'];
const PARADE_BOUNCE = { y: [0, -8, 0] };
const PARADE_TRANSITION = (delay: number) => ({
  duration: 1.6,
  repeat: Infinity,
  ease: 'easeInOut' as const,
  delay,
});

/** Cheerful row of all six piece emojis bouncing in sequence — the visual
 *  hello of the auth pages. Communicates "this is a game" before the user
 *  even reads the title. */
export function PieceParade() {
  return (
    <div
      className="flex items-center justify-center gap-2 sm:gap-3 mb-3 select-none"
      aria-hidden
      style={{ fontSize: 'clamp(28px, 6vw, 36px)', lineHeight: 1 }}
    >
      {PARADE_ORDER.map((type, i) => (
        <motion.span
          key={type}
          animate={PARADE_BOUNCE}
          transition={PARADE_TRANSITION(i * 0.18)}
          style={{ display: 'inline-block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}
        >
          {PIECE_EMOJI[type]}
        </motion.span>
      ))}
    </div>
  );
}

// Pre-randomised positions for the floating background pieces — keeps each
// piece in its own corner so they don't pile up. Numbers are percentages.
interface FloatSpec {
  emoji: string;
  top: string;
  left: string;
  size: number;
  drift: number;
  duration: number;
  delay: number;
}
const FLOAT_SPECS: FloatSpec[] = [
  { emoji: '🦁', top: '8%',  left: '6%',  size: 64, drift: 14, duration: 7.5, delay: 0   },
  { emoji: '🦋', top: '14%', left: '88%', size: 52, drift: 10, duration: 6.0, delay: 0.7 },
  { emoji: '🐘', top: '78%', left: '4%',  size: 70, drift: 16, duration: 8.2, delay: 1.2 },
  { emoji: '🐒', top: '82%', left: '90%', size: 56, drift: 12, duration: 6.8, delay: 0.4 },
  { emoji: '🦇', top: '46%', left: '92%', size: 48, drift: 10, duration: 7.0, delay: 1.5 },
  { emoji: '🐜', top: '52%', left: '3%',  size: 44, drift: 8,  duration: 5.5, delay: 0.9 },
];

function floatVariant(drift: number) {
  return { y: [0, -drift, 0], rotate: [-3, 3, -3] };
}
function floatTransition(duration: number, delay: number) {
  return {
    duration,
    repeat: Infinity,
    ease: 'easeInOut' as const,
    delay,
  };
}

/** Soft, drifting piece emojis scattered around the page edges. Pure
 *  decoration — pointer-events disabled so they never block clicks. */
export function FloatingPiecesBackdrop() {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden
      style={{ zIndex: 0 }}
    >
      {FLOAT_SPECS.map((spec, i) => (
        <motion.span
          key={i}
          animate={floatVariant(spec.drift)}
          transition={floatTransition(spec.duration, spec.delay)}
          style={{
            position: 'absolute',
            top: spec.top,
            left: spec.left,
            fontSize: spec.size,
            opacity: 0.09,
            filter: 'blur(0.4px)',
            lineHeight: 1,
          }}
        >
          {spec.emoji}
        </motion.span>
      ))}
    </div>
  );
}

interface IconInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className' | 'style'> {
  icon: string;
}

/** Themed input with a leading emoji icon and a subtle focus glow. Drop-in
 *  replacement for the previous flat <input>. */
export function IconInput({ icon, ...rest }: IconInputProps) {
  const { theme } = useSettings();
  return (
    <label
      className="flex items-center gap-2 rounded-xl px-3 py-2 transition-all focus-within:scale-[1.01]"
      style={{
        background: theme.inputBg,
        border: `1px solid ${theme.buttonBorder}`,
        boxShadow: `0 0 0 0 ${theme.p1Color}`,
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLLabelElement).style.boxShadow = `0 0 0 3px color-mix(in srgb, ${theme.p1Color} 35%, transparent)`;
        (e.currentTarget as HTMLLabelElement).style.borderColor = theme.p1Color;
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLLabelElement).style.boxShadow = `0 0 0 0 ${theme.p1Color}`;
        (e.currentTarget as HTMLLabelElement).style.borderColor = theme.buttonBorder;
      }}
    >
      <span aria-hidden className="text-lg select-none opacity-80">{icon}</span>
      <input
        {...rest}
        className="bg-transparent outline-none w-full text-sm py-1"
        style={{ color: theme.inputText }}
      />
    </label>
  );
}
