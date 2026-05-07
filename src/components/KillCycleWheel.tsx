'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';

/** Visual key for "who beats who". 6 piece emojis sit on a circle, with
 *  arrows from each piece to the one it kills. The Lion sits in the
 *  middle and has arrows out to ALL of them — the universal killer.
 *
 *  Tap any piece on the circle to highlight its kill arrow + show a
 *  one-line plain-English explanation under the wheel. Used as the
 *  intro step of the tutorial. */
type WedgeKey = 'elephant' | 'ant' | 'butterfly' | 'bat' | 'monkey';

interface Piece {
  key: WedgeKey;
  emoji: string;
  /** Whom this piece kills. */
  kills: WedgeKey | 'lion';
  /** Locale key for the kill-rule line shown when this piece is tapped. */
  bodyKey: string;
}

// Order around the ring (top → clockwise). The arrows flow piece → its
// target; positions chosen so most arrows are short hops between
// neighbours, with one or two longer ones for the "across the wheel"
// matchups (e.g. Elephant → Lion in the centre).
const RING: Piece[] = [
  { key: 'elephant',  emoji: '🐘', kills: 'lion',     bodyKey: 'tutorial.wheelElephant' },
  { key: 'ant',       emoji: '🐜', kills: 'elephant', bodyKey: 'tutorial.wheelAnt' },
  { key: 'butterfly', emoji: '🦋', kills: 'ant',      bodyKey: 'tutorial.wheelButterfly' },
  { key: 'bat',       emoji: '🦇', kills: 'butterfly',bodyKey: 'tutorial.wheelBat' },
  { key: 'monkey',    emoji: '🐒', kills: 'bat',      bodyKey: 'tutorial.wheelMonkey' },
];

const SIZE = 320;       // viewBox + render size
const CENTER = SIZE / 2;
const RADIUS = 118;     // ring radius from centre
const PIECE_RADIUS = 26;

function ringPoint(i: number) {
  // 5 pieces around the ring, 0 at top, going clockwise.
  const angle = (i / RING.length) * Math.PI * 2 - Math.PI / 2;
  return { x: CENTER + Math.cos(angle) * RADIUS, y: CENTER + Math.sin(angle) * RADIUS };
}

interface Props {
  /** Tap-into-explanation handler — called whenever the user picks a
   *  piece. The page above the wheel uses it to update the body line. */
  onPick?: (key: WedgeKey | 'lion') => void;
  /** Currently-selected piece (so the wheel can highlight its arrow). */
  selected?: WedgeKey | 'lion' | null;
}

export default function KillCycleWheel({ onPick, selected }: Props) {
  const { theme } = useSettings();
  const [hovered, setHovered] = useState<WedgeKey | 'lion' | null>(null);
  const active = hovered ?? selected ?? null;

  // Index lookup so the arrow renderer knows where each piece sits.
  const idx: Record<WedgeKey, number> = {
    elephant: 0, ant: 1, butterfly: 2, bat: 3, monkey: 4,
  };

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE, margin: '0 auto' }}>
      {/* Slow auto-rotation on the ring container — pure decorative. */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, ease: 'linear', repeat: Infinity }}
      >
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
          <defs>
            <marker
              id="zi-arrow"
              viewBox="0 0 10 10"
              refX="8" refY="5"
              markerWidth="6" markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.p1Color} />
            </marker>
            <marker
              id="zi-arrow-dim"
              viewBox="0 0 10 10"
              refX="8" refY="5"
              markerWidth="6" markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.textMuted} fillOpacity="0.35" />
            </marker>
          </defs>

          {/* Ring → ring arrows (each piece to its kill target on the ring,
              skipping the Lion which gets centre-out arrows below). */}
          {RING.map(p => {
            if (p.kills === 'lion') return null; // drawn separately, centre-out
            const from = ringPoint(idx[p.key]);
            const to = ringPoint(idx[p.kills]);
            const isActive = active === p.key;
            return (
              <line
                key={`ring-${p.key}`}
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={isActive ? theme.p1Color : theme.textMuted}
                strokeOpacity={isActive ? 0.95 : 0.35}
                strokeWidth={isActive ? 3 : 2}
                markerEnd={isActive ? 'url(#zi-arrow)' : 'url(#zi-arrow-dim)'}
              />
            );
          })}

          {/* Lion → all 5 ring pieces (centre-out). The Lion is the
              universal killer; visualising it as a hub drives that home. */}
          {active === 'lion' && RING.map(p => {
            const to = ringPoint(idx[p.key]);
            // Stop slightly short of the piece circle so the arrowhead lands
            // outside the emoji bubble, not inside it.
            const dx = to.x - CENTER, dy = to.y - CENTER;
            const len = Math.hypot(dx, dy);
            const tx = CENTER + (dx / len) * (len - PIECE_RADIUS - 6);
            const ty = CENTER + (dy / len) * (len - PIECE_RADIUS - 6);
            return (
              <line
                key={`lion-${p.key}`}
                x1={CENTER} y1={CENTER} x2={tx} y2={ty}
                stroke={theme.p1Color}
                strokeOpacity={0.85}
                strokeWidth={2.5}
                markerEnd="url(#zi-arrow)"
              />
            );
          })}

          {/* Elephant → Lion (centre-in): the one ring-to-centre arrow.
              Drawn always (not hover-gated) so the player sees the
              Lion-vs-Elephant matchup even before tapping. */}
          {(() => {
            const from = ringPoint(idx.elephant);
            const dx = CENTER - from.x, dy = CENTER - from.y;
            const len = Math.hypot(dx, dy);
            const tx = from.x + (dx / len) * (len - PIECE_RADIUS - 6);
            const ty = from.y + (dy / len) * (len - PIECE_RADIUS - 6);
            const isActive = active === 'elephant';
            return (
              <line
                x1={from.x} y1={from.y} x2={tx} y2={ty}
                stroke={isActive ? theme.p1Color : theme.textMuted}
                strokeOpacity={isActive ? 0.95 : 0.35}
                strokeWidth={isActive ? 3 : 2}
                markerEnd={isActive ? 'url(#zi-arrow)' : 'url(#zi-arrow-dim)'}
              />
            );
          })()}
        </svg>
      </motion.div>

      {/* Pieces (kept OUTSIDE the rotating layer so the emojis stay
          upright while the arrows beneath sweep around). The whole
          ring rotation is on the SVG above; emoji buttons are static. */}
      <div className="absolute inset-0">
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
                boxShadow: isActive ? `0 0 16px ${theme.p1Color}80` : 'none',
              }}
            >
              <span aria-hidden style={{ fontSize: 26, lineHeight: 1 }}>{p.emoji}</span>
            </button>
          );
        })}

        {/* Lion at centre — the universal killer. */}
        <button
          type="button"
          onMouseEnter={() => setHovered('lion')}
          onMouseLeave={() => setHovered(null)}
          onClick={() => onPick?.('lion')}
          className="absolute rounded-full inline-flex items-center justify-center transition-transform hover:scale-110"
          style={{
            width: PIECE_RADIUS * 2 + 8,
            height: PIECE_RADIUS * 2 + 8,
            left: CENTER - PIECE_RADIUS - 4,
            top: CENTER - PIECE_RADIUS - 4,
            background: active === 'lion' ? theme.p1AccentBg : theme.panelBg,
            border: `2.5px solid ${active === 'lion' ? theme.p1Color : theme.p1AccentBorder}`,
            boxShadow: active === 'lion' ? `0 0 22px ${theme.p1Color}90` : `0 0 12px ${theme.p1Color}40`,
          }}
        >
          <span aria-hidden style={{ fontSize: 30, lineHeight: 1 }}>🦁</span>
        </button>
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
