'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/hooks/useSettings';

/** Animated decoration overlay scoped to the 'celestial' premium theme.
 *  Renders nothing for any other theme, so the cost is exactly one
 *  context read on the other six. Five layered effects:
 *
 *    1. Top bloom — slow horizontal-drifting wash of warm light
 *    2. Bottom aurora curtain — three breathing strands
 *    3. Sparkles — 50 dots, randomized, gentle twinkle
 *    4. Ribbons — 5 horizontal "lines" sweeping across the screen
 *    5. Diagonal trails — 4 short bright streaks at varied angles
 *
 *  Random positions are computed once with useMemo so they stay
 *  stable across re-renders (a fresh Math.random() each render
 *  would jitter the entire field). All layers are pointer-events:
 *  none and sit behind interactive controls (z-index: 1, controls
 *  use z-30+). */
export default function ThemeDecor() {
  const { themeId } = useSettings();
  // Math.random() differs between server and client, so we defer the
  // field generation to a mount effect to avoid a hydration mismatch
  // warning. Same pattern AnimatedBackground uses on the start screen.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Sparkles: 50 dots with a mix of colours. Sized 1–3.5px so the
  // smaller ones fade like distant stars and the larger ones look
  // like nearby fairy lights.
  const sparkles = useMemo(() => {
    if (!mounted) return [];
    const palette = ['#ffffff', '#fde68a', '#fbcfe8', '#ddd6fe', '#a7f3d0'];
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      top: rand(0, 100),
      left: rand(0, 100),
      size: rand(1.2, 3.6),
      delay: rand(0, 6),
      duration: rand(2.6, 5.5),
      color: palette[i % palette.length],
    }));
  }, [mounted]);

  // Ribbons: five sweeping "lines" at varied y positions, stacked
  // delays so they don't all enter the screen at once. Durations
  // alternate fast/slow so the field never feels metronomic.
  const ribbons = useMemo(() => [
    { top: '14%', delay: '0s',  duration: '11s' },
    { top: '32%', delay: '3s',  duration: '14s' },
    { top: '52%', delay: '6s',  duration: '12s' },
    { top: '70%', delay: '9s',  duration: '15s' },
    { top: '86%', delay: '12s', duration: '13s' },
  ], []);

  // Trails: shorter, brighter, diagonal. Each picks a different
  // angle so they don't look like a fleet of identical comets.
  const trails = useMemo(() => [
    { top: '18%', left: '-25vw', angle: '-15deg', delay: '2s',  duration: '7s'  },
    { top: '46%', left: '-25vw', angle: '-22deg', delay: '5s',  duration: '8s'  },
    { top: '64%', left: '-25vw', angle: '-12deg', delay: '8s',  duration: '6s'  },
    { top: '82%', left: '-25vw', angle: '-20deg', delay: '11s', duration: '7.5s' },
  ], []);

  if (themeId !== 'celestial') return null;
  // Render nothing until mounted so the SSR HTML and the first client
  // render match (the bloom + curtain are static so they could ship
  // SSR-side, but rendering everything in one pass keeps the code
  // simple and the visual delay is one frame).
  if (!mounted) return null;

  return (
    <div className="zi-celestial-root" aria-hidden>
      <div className="zi-celestial-bloom" />
      <div className="zi-celestial-curtain" />
      {sparkles.map(s => (
        <span
          key={s.id}
          className="zi-celestial-sparkle"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: s.size,
            height: s.size,
            color: s.color,
            background: s.color,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}
      {ribbons.map((r, i) => (
        <div
          key={`r${i}`}
          className="zi-celestial-ribbon"
          style={{
            top: r.top,
            left: 0,
            animationDelay: r.delay,
            animationDuration: r.duration,
          }}
        />
      ))}
      {trails.map((t, i) => (
        <div
          key={`t${i}`}
          className="zi-celestial-trail"
          style={{
            top: t.top,
            left: t.left,
            // CSS custom property feeds the @keyframes so each trail
            // keeps its own angle through the entire animation.
            ['--zi-trail-angle' as string]: t.angle,
            animationDelay: t.delay,
            animationDuration: t.duration,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
