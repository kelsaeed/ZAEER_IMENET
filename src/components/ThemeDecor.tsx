'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/hooks/useSettings';

/** Layout-level theme decoration. Reads the local viewer's active
 *  theme + its decor_kind from the catalog. Renders nothing for
 *  themes whose decor_kind is 'none' (or unknown). When SplitBackground
 *  is showing two different themes it sets `body.zi-split-active`,
 *  which hides this full-screen layer (per-half decor takes over). */
export default function ThemeDecor() {
  const { activeThemeId, getDecorKind } = useSettings();
  const decorKind = getDecorKind(activeThemeId);

  if (decorKind === 'none') return null;
  return <ThemeDecorLayer decorKind={decorKind} placement="full" />;
}

interface LayerProps {
  decorKind: string;
  /** 'full' = entire viewport (used at layout level outside matches).
   *  'half-top' / 'half-bottom' = one half of the viewport (used by
   *  SplitBackground when each player has a different theme). */
  placement: 'full' | 'half-top' | 'half-bottom';
}

/** The actual rendering. Public so SplitBackground can mount instances
 *  per-player half. Each placement variant scopes the overlay to its
 *  region via different CSS rules; the contents (sparkles, ribbons,
 *  bloom, curtain, trails) are identical. */
export function ThemeDecorLayer({ decorKind, placement }: LayerProps) {
  // Math.random() differs between SSR and the first client render;
  // defer the field generation to a mount effect to avoid a hydration
  // mismatch warning.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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

  const ribbons = useMemo(() => [
    { top: '14%', delay: '0s',  duration: '11s' },
    { top: '32%', delay: '3s',  duration: '14s' },
    { top: '52%', delay: '6s',  duration: '12s' },
    { top: '70%', delay: '9s',  duration: '15s' },
    { top: '86%', delay: '12s', duration: '13s' },
  ], []);

  const trails = useMemo(() => [
    { top: '18%', left: '-25vw', angle: '-15deg', delay: '2s',  duration: '7s'  },
    { top: '46%', left: '-25vw', angle: '-22deg', delay: '5s',  duration: '8s'  },
    { top: '64%', left: '-25vw', angle: '-12deg', delay: '8s',  duration: '6s'  },
    { top: '82%', left: '-25vw', angle: '-20deg', delay: '11s', duration: '7.5s' },
  ], []);

  if (decorKind !== 'celestial') return null;
  if (!mounted) return null;

  const placementClass =
    placement === 'half-top'    ? 'zi-celestial-half-top'    :
    placement === 'half-bottom' ? 'zi-celestial-half-bottom' :
    'zi-celestial-full';

  return (
    <div className={`zi-celestial-root ${placementClass}`} aria-hidden>
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
    </div>
  );
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
