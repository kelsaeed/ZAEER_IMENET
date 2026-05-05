'use client';

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
 *  in a wave, looping forever. Driven by a CSS @keyframes (zi-emoji-bob in
 *  globals.css) so the wave runs on the compositor — no JS per frame, no
 *  restart on parent re-renders. */
export default function LoadingEmojis({ size = 22, gap = 4, label }: Props) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'inline-flex', gap }} aria-hidden>
        {ICONS.map((e, i) => (
          <span
            key={i}
            className="zi-emoji-bob"
            style={{
              fontSize: size,
              lineHeight: 1,
              animationDelay: `${i * 0.13}s`,
            }}
          >
            {e}
          </span>
        ))}
      </span>
      {label && <span className="text-sm opacity-80">{label}</span>}
    </span>
  );
}
