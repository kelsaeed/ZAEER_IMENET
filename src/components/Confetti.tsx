'use client';
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  /** Palette the falling pieces are picked from. Pass the winner's
   *  theme accents so the confetti reads as "their colours". */
  colors: string[];
  /** Number of pieces. Defaults to 60 on desktop, 32 on mobile so
   *  low-end Android compositors don't drop frames during the win
   *  modal animation. Override only if you have a reason. */
  count?: number;
  /** How long any single piece stays in flight. Each piece picks a
   *  random value in [duration*0.7, duration*1.3] so the field
   *  doesn't disappear in one frame. */
  duration?: number;
}

/** A short confetti burst rendered as plain divs animated by
 *  framer-motion. No canvas, no asset, no wasm — happy to ship in a
 *  modal or anywhere a `position: relative` ancestor exists. The
 *  parent should `pointer-events: none` so the falling pieces never
 *  intercept the celebration buttons underneath. */
export default function Confetti({ colors, count, duration = 4 }: Props) {
  // Default count picks based on viewport — fewer pieces on mobile so
  // the compositor stays smooth alongside the win-modal spring + the
  // bobbing crown + the 6 hopping piece icons.
  const [defaultCount, setDefaultCount] = useState(60);
  useEffect(() => {
    const update = () => setDefaultCount(window.innerWidth < 768 ? 32 : 60);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const pieceCount = count ?? defaultCount;

  // Generate piece geometry once so the field doesn't re-randomise
  // each render. Includes intentional left-right drift via x-end so
  // pieces don't fall in straight perfectly-vertical lines.
  const pieces = useMemo(() => {
    const palette = colors.length > 0 ? colors : ['#fbbf24'];
    return Array.from({ length: pieceCount }, (_, i) => {
      const dx = (Math.random() - 0.5) * 30;            // -15% .. +15%
      return {
        id: i,
        leftPct: Math.random() * 100,
        size: 5 + Math.random() * 7,
        ratio: 1.2 + Math.random() * 0.6,
        color: palette[Math.floor(Math.random() * palette.length)],
        delay: Math.random() * 1.2,
        duration: duration * (0.7 + Math.random() * 0.6),
        rotate: (Math.random() - 0.5) * 720,
        dxPct: dx,
      };
    });
  }, [colors, pieceCount, duration]);

  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex: 1 }}
    >
      {pieces.map(p => (
        <motion.span
          key={p.id}
          initial={{ y: '-10vh', x: 0, rotate: 0, opacity: 0 }}
          animate={{
            y: '110vh',
            x: `${p.dxPct}vw`,
            rotate: p.rotate,
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: 'linear',
            opacity: { times: [0, 0.06, 0.85, 1] },
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: `${p.leftPct}%`,
            width: p.size,
            height: p.size * p.ratio,
            background: p.color,
            borderRadius: 1,
            // Rounded confetti rectangles read as bits of streamer
            // rather than tiny squares.
            boxShadow: `0 0 4px ${p.color}55`,
          }}
        />
      ))}
    </div>
  );
}
