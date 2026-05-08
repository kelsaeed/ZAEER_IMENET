'use client';
import { useEffect, useMemo, useState } from 'react';
import { BOARD_SIZE } from '@/game/constants';
import { useSettings } from '@/hooks/useSettings';
import { usePlayerThemes } from '@/hooks/usePlayerThemes';

interface Props {
  /** Cell width in pixels — used to size the overlay so the halves
   *  line up exactly with rows 0–7 and 8–15. */
  cellSize: number;
}

/** Animated overlay positioned over the board grid. Reads each
 *  player's theme decor_kind and renders a separate overlay for the
 *  top half (rows 0–7, opponent's territory) and the bottom half
 *  (rows 8–15, viewer's territory). The two halves are independent —
 *  if only one player has a premium theme, only that player's half
 *  gets animations.
 *
 *  The decor is part of the board, not the page, so both viewers see
 *  the same animations on the same half — the "celestial player's
 *  half" looks magical from either side of the table. The opponent's
 *  page background stays whatever theme they picked. */
export default function BoardDecor({ cellSize }: Props) {
  const { getDecorKind } = useSettings();
  const themes = usePlayerThemes();

  // Mobile gate. The board decor (and the page-wide ThemeDecor under
  // celestial) used to crush low-end Android phones — 38 animated
  // elements with mix-blend-mode + blur layered on top of 256
  // BoardCells starves the compositor and clicks lag for seconds.
  // Below ~36px cell size we skip the on-board decor entirely; the
  // local viewer still gets the page-wide ThemeDecor (which itself
  // is dialled down on mobile).
  if (cellSize < 36) return null;

  const topKind = getDecorKind(themes.p2.id);
  const bottomKind = getDecorKind(themes.p1.id);
  if (topKind === 'none' && bottomKind === 'none') return null;

  // Geometry: the board container reserves cellSize*0.5 for the row
  // label column; the cells start at left = 0.5*cellSize. Each half
  // covers 8 rows.
  const labelOffset = cellSize * 0.5;
  const cellsWidth = cellSize * BOARD_SIZE;
  const halfHeight = cellSize * (BOARD_SIZE / 2);

  return (
    <>
      {topKind !== 'none' && (
        <BoardDecorHalf
          decorKind={topKind}
          style={{ top: 0, left: labelOffset, width: cellsWidth, height: halfHeight }}
        />
      )}
      {bottomKind !== 'none' && (
        <BoardDecorHalf
          decorKind={bottomKind}
          style={{ top: halfHeight, left: labelOffset, width: cellsWidth, height: halfHeight }}
        />
      )}
    </>
  );
}

interface HalfProps {
  decorKind: string;
  style: React.CSSProperties;
}

function BoardDecorHalf({ decorKind, style }: HalfProps) {
  // Math.random() differs between SSR and the first client render;
  // defer the field generation to a mount effect.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Halved counts vs. the first cut so the compositor has less to do
  // each frame. 8 sparkles + 1 trail + 2 diagonals per half ≈ 22
  // total animated elements when both players have celestial — about
  // a third of the original budget.
  const sparkles = useMemo(() => {
    if (!mounted) return [];
    const palette = ['#ffffff', '#fde68a', '#fbcfe8', '#ddd6fe', '#a7f3d0'];
    return Array.from({ length: 8 }, (_, i) => ({
      id: i,
      top: rand(5, 95),
      left: rand(2, 98),
      size: rand(1.4, 3),
      delay: rand(0, 5),
      duration: rand(2.4, 4.6),
      color: palette[i % palette.length],
    }));
  }, [mounted]);

  const trails = useMemo(() => [
    { top: '40%', angle: '-24deg', delay: '2s', duration: '6s' },
  ], []);

  const diagonals = useMemo(() => [
    { angle: '-26deg', delay: '0s', duration: '12s' },
    { angle: '-32deg', delay: '6s', duration: '14s' },
  ], []);

  if (decorKind !== 'celestial') return null;
  if (!mounted) return null;

  return (
    <div className="zi-board-decor-half" style={style} aria-hidden>
      {sparkles.map(s => (
        <span
          key={s.id}
          className="zi-board-sparkle"
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
      {trails.map((t, i) => (
        <div
          key={`bt${i}`}
          className="zi-board-trail"
          style={{
            top: t.top,
            left: 0,
            ['--zi-bt-angle' as string]: t.angle,
            animationDelay: t.delay,
            animationDuration: t.duration,
          } as React.CSSProperties}
        />
      ))}
      {diagonals.map((d, i) => (
        <div
          key={`bd${i}`}
          className="zi-board-diagonal"
          style={{
            ['--zi-bd-angle' as string]: d.angle,
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
