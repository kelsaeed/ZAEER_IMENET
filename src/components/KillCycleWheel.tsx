'use client';
import { useState } from 'react';
import { useSettings } from '@/hooks/useSettings';

/** Visual key for "who beats who". 5 piece emojis sit on a circle, with
 *  arrows from each piece to the one it kills. The Lion sits in the
 *  middle and has arrows out to ALL of them — the universal killer.
 *
 *  This is now a STATIC wheel — no rotation. Earlier builds had the
 *  whole ring orbit around the centre, which created a class of
 *  arrow-positioning bugs that were impossible to debug from a
 *  screenshot. Static layout means arrow endpoints land exactly where
 *  they should, every time.
 *
 *  Click any piece (including the centre Lion) to highlight its kill
 *  arrows + show a one-line plain-English rule under the wheel. */
type WedgeKey = 'elephant' | 'ant' | 'butterfly' | 'bat' | 'monkey';

interface Piece {
  key: WedgeKey;
  emoji: string;
  /** Whom this piece kills. */
  kills: WedgeKey | 'lion';
}

// Order around the ring (top → clockwise).
const RING: Piece[] = [
  { key: 'elephant',  emoji: '🐘', kills: 'lion' },
  { key: 'ant',       emoji: '🐜', kills: 'elephant' },
  { key: 'butterfly', emoji: '🦋', kills: 'ant' },
  { key: 'bat',       emoji: '🦇', kills: 'butterfly' },
  { key: 'monkey',    emoji: '🐒', kills: 'bat' },
];

const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = 120;
const PIECE_RADIUS = 28;

function ringPoint(i: number) {
  const angle = (i / RING.length) * Math.PI * 2 - Math.PI / 2;
  return { x: CENTER + Math.cos(angle) * RADIUS, y: CENTER + Math.sin(angle) * RADIUS };
}

/** Shift a line's two endpoints perpendicular to its direction so two
 *  arrows running between the same pair of pieces don't sit on top of
 *  each other. Used for the Elephant↔Lion bidirectional matchup. */
function offsetLine(
  sx: number, sy: number, tx: number, ty: number, perp: number
): [number, number, number, number] {
  const dx = tx - sx, dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  return [sx + px * perp, sy + py * perp, tx + px * perp, ty + py * perp];
}

interface Props {
  onPick?: (key: WedgeKey | 'lion') => void;
  selected?: WedgeKey | 'lion' | null;
}

const COLOR_OUT  = '#ef4444';   // bright red — what this piece kills (outgoing)
const COLOR_IN   = '#fbbf24';   // sunny yellow — what kills this piece (incoming)

export default function KillCycleWheel({ onPick, selected }: Props) {
  const { theme } = useSettings();
  const [hovered, setHovered] = useState<WedgeKey | 'lion' | null>(null);
  // Selection sticks; hover only previews when nothing has been picked.
  const active = selected ?? hovered ?? null;

  const idx: Record<WedgeKey, number> = {
    elephant: 0, ant: 1, butterfly: 2, bat: 3, monkey: 4,
  };

  type ArrowState = 'out' | 'in' | 'dim';
  const arrowState = (from: WedgeKey | 'lion', to: WedgeKey | 'lion'): ArrowState => {
    if (active === from) return 'out';
    if (active === to)   return 'in';
    return 'dim';
  };

  // Reverse-lookup: which arrow is incoming to the active piece in the
  // ring cycle? Used by the debug strip below the wheel so we can
  // sanity-check the arrow logic at a glance.
  const incomingFrom = (() => {
    if (!active) return null;
    if (active === 'lion') return 'elephant';
    const killer = RING.find(p => p.kills === active);
    return killer?.key ?? null;
  })();
  const outgoingTo = (() => {
    if (!active) return null;
    if (active === 'lion') return 'all 5';
    const piece = RING.find(p => p.key === active);
    return piece?.kills ?? null;
  })();

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE, margin: '0 auto' }}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        className="absolute inset-0"
      >
        <defs>
          <filter id="zi-arrow-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <marker
            id="zi-arrow-out"
            viewBox="0 0 12 12"
            refX="9" refY="6"
            markerWidth="8" markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 12 6 L 0 12 z" fill={COLOR_OUT} />
          </marker>
          <marker
            id="zi-arrow-in"
            viewBox="0 0 12 12"
            refX="9" refY="6"
            markerWidth="8" markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 12 6 L 0 12 z" fill={COLOR_IN} />
          </marker>
          <marker
            id="zi-arrow-dim"
            viewBox="0 0 12 12"
            refX="9" refY="6"
            markerWidth="6" markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 12 6 L 0 12 z" fill={theme.textMuted} fillOpacity="0.6" />
          </marker>
        </defs>

        {/* (1) Ring → ring arrows. Skips elephant→lion which goes
            centre-in below. Always drawn; bright/dim depending on
            whether either endpoint is the active piece. */}
        {RING.map(p => {
          if (p.kills === 'lion') return null;
          const from = ringPoint(idx[p.key]);
          const to   = ringPoint(idx[p.kills]);
          const st   = arrowState(p.key, p.kills);
          const dx = to.x - from.x, dy = to.y - from.y;
          const len = Math.hypot(dx, dy);
          const sx = from.x + (dx / len) * (PIECE_RADIUS + 4);
          const sy = from.y + (dy / len) * (PIECE_RADIUS + 4);
          const tx = from.x + (dx / len) * (len - PIECE_RADIUS - 6);
          const ty = from.y + (dy / len) * (len - PIECE_RADIUS - 6);
          const stroke =
            st === 'out' ? COLOR_OUT  :
            st === 'in'  ? COLOR_IN   :
            theme.textMuted;
          const markerId =
            st === 'out' ? 'zi-arrow-out' :
            st === 'in'  ? 'zi-arrow-in'  :
            'zi-arrow-dim';
          return (
            <line
              key={`ring-${p.key}`}
              x1={sx} y1={sy} x2={tx} y2={ty}
              stroke={stroke}
              strokeOpacity={st === 'dim' ? 0.6 : 1}
              strokeWidth={st === 'dim' ? 2.5 : 4}
              strokeLinecap="round"
              filter={st === 'dim' ? undefined : 'url(#zi-arrow-glow)'}
              markerEnd={`url(#${markerId})`}
            />
          );
        })}

        {/* (2) Lion → ring arrows (centre-out). Drawn either:
              – ALL FIVE in red when Lion is active (Lion kills any
                enemy), OR
              – ONE in yellow (lion→activePiece) when ANY ring piece
                is active. The Lion is a universal killer, so it's
                always an incoming threat to whoever's selected.
            Centre-out arrows are shifted +10 perpendicular so they
            sit alongside the centre-in elephant→lion arrow (-10) when
            both apply, instead of overlapping it. */}
        {RING.map(p => {
          const lionIsActive  = active === 'lion';
          const pieceIsActive = active === p.key;
          if (!lionIsActive && !pieceIsActive) return null;

          const to = ringPoint(idx[p.key]);
          const dx = to.x - CENTER, dy = to.y - CENTER;
          const len = Math.hypot(dx, dy);
          const sx = CENTER + (dx / len) * (PIECE_RADIUS + 4);
          const sy = CENTER + (dy / len) * (PIECE_RADIUS + 4);
          const tx = CENTER + (dx / len) * (len - PIECE_RADIUS - 6);
          const ty = CENTER + (dy / len) * (len - PIECE_RADIUS - 6);
          const stroke   = lionIsActive ? COLOR_OUT : COLOR_IN;
          const markerId = lionIsActive ? 'zi-arrow-out' : 'zi-arrow-in';
          // Only offset the elephant pair — for other ring pieces
          // there's no centre-in arrow to collide with. We use +10 here
          // and ALSO +10 on the centre-in arrow below: because the
          // perpendicular vector flips sign with line direction (one
          // line goes up, the other goes down), the same offset value
          // pushes the two lines onto OPPOSITE sides. Using +10 / -10
          // would push them onto the same side and re-overlap them.
          const perp = p.key === 'elephant' ? +10 : 0;
          const [ox1, oy1, ox2, oy2] = offsetLine(sx, sy, tx, ty, perp);
          return (
            <line
              key={`lion-${p.key}`}
              x1={ox1} y1={oy1} x2={ox2} y2={oy2}
              stroke={stroke}
              strokeOpacity={1}
              strokeWidth={4}
              strokeLinecap="round"
              filter="url(#zi-arrow-glow)"
              markerEnd={`url(#${markerId})`}
            />
          );
        })}

        {/* (3) Elephant → Lion (centre-in). Always drawn. Red when
            Elephant active, yellow when Lion active, dim otherwise.
            Shifted -10 perpendicular so when both this and the
            lion→elephant centre-out (above, +10) are drawn for the
            same matchup, they appear as two parallel arrows pointing
            opposite ways instead of one collinear line. */}
        {(() => {
          const from = ringPoint(idx.elephant);
          const dx = CENTER - from.x, dy = CENTER - from.y;
          const len = Math.hypot(dx, dy);
          const sx = from.x + (dx / len) * (PIECE_RADIUS + 4);
          const sy = from.y + (dy / len) * (PIECE_RADIUS + 4);
          const tx = from.x + (dx / len) * (len - PIECE_RADIUS - 8);
          const ty = from.y + (dy / len) * (len - PIECE_RADIUS - 8);
          const st = arrowState('elephant', 'lion');
          const stroke =
            st === 'out' ? COLOR_OUT  :
            st === 'in'  ? COLOR_IN   :
            theme.textMuted;
          const markerId =
            st === 'out' ? 'zi-arrow-out' :
            st === 'in'  ? 'zi-arrow-in'  :
            'zi-arrow-dim';
          // SAME +10 sign as the centre-out arrow above — perpendicular
          // direction flips with line direction, so equal-sign offsets
          // land on opposite sides of the original line.
          const [ox1, oy1, ox2, oy2] = offsetLine(sx, sy, tx, ty, +10);
          return (
            <line
              x1={ox1} y1={oy1} x2={ox2} y2={oy2}
              stroke={stroke}
              strokeOpacity={st === 'dim' ? 0.6 : 1}
              strokeWidth={st === 'dim' ? 2.5 : 4}
              strokeLinecap="round"
              filter={st === 'dim' ? undefined : 'url(#zi-arrow-glow)'}
              markerEnd={`url(#${markerId})`}
            />
          );
        })()}
      </svg>

      {/* Ring piece bubbles. */}
      {RING.map(p => {
        const pos = ringPoint(idx[p.key]);
        const isActive = active === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onMouseEnter={() => setHovered(p.key)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onPick?.(p.key)}
            className="absolute rounded-full inline-flex items-center justify-center transition-transform hover:scale-110"
            style={{
              width: PIECE_RADIUS * 2,
              height: PIECE_RADIUS * 2,
              left: pos.x - PIECE_RADIUS,
              top: pos.y - PIECE_RADIUS,
              background: isActive ? theme.p1AccentBg : theme.panelBg,
              border: `2px solid ${isActive ? theme.p1Color : theme.panelBorder}`,
              boxShadow: isActive ? `0 0 20px ${theme.p1Color}80` : '0 4px 12px rgba(0,0,0,0.35)',
            }}
          >
            <span aria-hidden style={{ fontSize: 28, lineHeight: 1 }}>{p.emoji}</span>
          </button>
        );
      })}

      {/* Lion at centre. */}
      <button
        type="button"
        onMouseEnter={() => setHovered('lion')}
        onMouseLeave={() => setHovered(null)}
        onClick={() => onPick?.('lion')}
        className="absolute rounded-full inline-flex items-center justify-center transition-transform hover:scale-110"
        style={{
          width: PIECE_RADIUS * 2 + 10,
          height: PIECE_RADIUS * 2 + 10,
          left: CENTER - PIECE_RADIUS - 5,
          top: CENTER - PIECE_RADIUS - 5,
          background: active === 'lion' ? theme.p1AccentBg : theme.panelBg,
          border: `3px solid ${active === 'lion' ? theme.p1Color : theme.p1AccentBorder}`,
          boxShadow: active === 'lion'
            ? `0 0 28px ${theme.p1Color}, inset 0 0 12px ${theme.p1Color}55`
            : `0 0 16px ${theme.p1Color}55`,
        }}
      >
        <span aria-hidden style={{ fontSize: 32, lineHeight: 1 }}>🦁</span>
      </button>

      {/* Tiny debug strip. Removable later — for now it surfaces what
          the wheel logic thinks is active and which arrows it should
          be drawing, so any mismatch between code intent and what's
          rendered is visible without DevTools. */}
      <div
        className="absolute font-mono text-[10px] leading-tight text-left"
        style={{
          left: 6,
          bottom: 6,
          color: theme.textMuted,
          opacity: 0.7,
          pointerEvents: 'none',
          maxWidth: SIZE - 12,
        }}
      >
        <div>active: <span style={{ color: theme.p1Color }}>{active ?? '(none)'}</span></div>
        <div>outgoing (red): <span style={{ color: COLOR_OUT }}>{active && outgoingTo ? `${active} → ${outgoingTo}` : '—'}</span></div>
        <div>incoming (yellow): <span style={{ color: COLOR_IN }}>
          {!active ? '—' :
           active === 'lion' ? `elephant → lion` :
           active === 'monkey' ? `lion → monkey` :
           `${incomingFrom} → ${active} + lion → ${active}`}
        </span></div>
      </div>
    </div>
  );
}

export type { WedgeKey };
export const PIECES_FOR_BODY: { key: WedgeKey | 'lion'; bodyKey: string }[] = [
  { key: 'lion',      bodyKey: 'tutorial.wheelLion' },
  { key: 'elephant',  bodyKey: 'tutorial.wheelElephant' },
  { key: 'ant',       bodyKey: 'tutorial.wheelAnt' },
  { key: 'butterfly', bodyKey: 'tutorial.wheelButterfly' },
  { key: 'bat',       bodyKey: 'tutorial.wheelBat' },
  { key: 'monkey',    bodyKey: 'tutorial.wheelMonkey' },
];
