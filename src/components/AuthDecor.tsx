'use client';
import { PIECE_EMOJI } from '@/game/constants';
import type { PieceType } from '@/game/types';
import { useSettings } from '@/hooks/useSettings';

const PARADE_ORDER: PieceType[] = ['lion', 'elephant', 'monkey', 'butterfly', 'bat', 'ant'];

/** A row of all six piece emojis above the auth-page title. Pure static
 *  render — no framer-motion, no infinite loops. The floating backdrop
 *  and bouncing parade we tried earlier looked nice but caused real
 *  perf jank on lower-end devices and during page entry, so this is a
 *  cheap visual hello with no animation cost. */
export function PieceParade() {
  return (
    <div
      className="flex items-center justify-center gap-2 sm:gap-3 mb-3 select-none"
      aria-hidden
      style={{ fontSize: 'clamp(28px, 6vw, 36px)', lineHeight: 1 }}
    >
      {PARADE_ORDER.map((type) => (
        <span
          key={type}
          style={{
            display: 'inline-block',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
          }}
        >
          {PIECE_EMOJI[type]}
        </span>
      ))}
    </div>
  );
}

interface IconInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className' | 'style'> {
  icon: string;
}

/** Themed input with a leading emoji icon and a subtle focus glow. */
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
