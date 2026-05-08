'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/hooks/useSettings';

/** Layout-level theme decoration. Reads the local viewer's active
 *  theme + its decor_kind from the catalog. Renders nothing for
 *  themes whose decor_kind is 'none'. The per-half / per-player
 *  decor lives on the board itself (see <BoardDecor/>) — this
 *  layer covers everything *outside* the board so the viewer's
 *  whole page feels like the celestial theme. */
export default function ThemeDecor() {
  const { activeThemeId, getDecorKind } = useSettings();
  const decorKind = getDecorKind(activeThemeId);

  // Math.random() differs between SSR and the first client render;
  // defer the field generation to a mount effect to avoid a hydration
  // mismatch warning.
  const [mounted, setMounted] = useState(false);
  // Phone vs desktop. The full-fat decor (50 sparkles + 8 trails +
  // 5 ribbons + 5 diagonals = 68 animated layers, all with
  // mix-blend-mode and blur) was crushing low-end Android. On phones
  // we keep the bloom + curtain (cheap — two static gradient divs)
  // and a slimmed sparkle/diagonal field; trails are dropped because
  // they're the heaviest animation per pixel.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setMounted(true);
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const sparkles = useMemo(() => {
    if (!mounted) return [];
    const count = isMobile ? 16 : 30;
    const palette = ['#ffffff', '#fde68a', '#fbcfe8', '#ddd6fe', '#a7f3d0'];
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      top: rand(0, 100),
      left: rand(0, 100),
      size: rand(1.2, 3.6),
      delay: rand(0, 6),
      duration: rand(2.6, 5.5),
      color: palette[i % palette.length],
    }));
  }, [mounted, isMobile]);

  const ribbons = useMemo(() => {
    const all = [
      { top: '14%', delay: '0s',  duration: '11s' },
      { top: '32%', delay: '3s',  duration: '14s' },
      { top: '52%', delay: '6s',  duration: '12s' },
      { top: '70%', delay: '9s',  duration: '15s' },
      { top: '86%', delay: '12s', duration: '13s' },
    ];
    return isMobile ? [all[1], all[3]] : all;
  }, [isMobile]);

  // Bottom-left → top-right shooting trails. All angles negative + a
  // leftward `left` and rightward translateX in the keyframe means
  // each trail walks BL→TR. Skipped entirely on phones — they're the
  // single most expensive element type in this overlay.
  const trails = useMemo(() => {
    if (isMobile) return [];
    return [
      { top: '12%', left: '-25vw', angle: '-15deg', delay: '0.5s', duration: '6s'   },
      { top: '24%', left: '-25vw', angle: '-22deg', delay: '2s',   duration: '7s'   },
      { top: '38%', left: '-25vw', angle: '-18deg', delay: '4s',   duration: '7.5s' },
      { top: '52%', left: '-25vw', angle: '-26deg', delay: '6s',   duration: '6.5s' },
      { top: '64%', left: '-25vw', angle: '-12deg', delay: '8s',   duration: '6s'   },
      { top: '74%', left: '-25vw', angle: '-20deg', delay: '10s',  duration: '8s'   },
      { top: '84%', left: '-25vw', angle: '-28deg', delay: '12s',  duration: '7s'   },
      { top: '92%', left: '-25vw', angle: '-16deg', delay: '14s',  duration: '6.5s' },
    ];
  }, [isMobile]);

  const diagonals = useMemo(() => {
    const all = [
      { angle: '-26deg', delay: '0s',  duration: '14s' },
      { angle: '-32deg', delay: '4s',  duration: '17s' },
      { angle: '-22deg', delay: '8s',  duration: '15s' },
      { angle: '-36deg', delay: '12s', duration: '18s' },
      { angle: '-28deg', delay: '16s', duration: '16s' },
    ];
    return isMobile ? [all[0], all[2]] : all;
  }, [isMobile]);

  if (decorKind !== 'celestial') return null;
  if (!mounted) return null;

  return (
    <div className="zi-celestial-root zi-celestial-full" aria-hidden>
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
            ['--zi-trail-angle' as string]: t.angle,
            animationDelay: t.delay,
            animationDuration: t.duration,
          } as React.CSSProperties}
        />
      ))}
      {diagonals.map((d, i) => (
        <div
          key={`d${i}`}
          className="zi-celestial-diagonal"
          style={{
            ['--zi-diag-angle' as string]: d.angle,
            animationDelay: d.delay,
            animationDuration: d.duration,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
