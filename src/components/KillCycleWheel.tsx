'use client';
import { useState } from 'react';
import { useSettings } from '@/hooks/useSettings';

/** Visual key for "who beats who". 5 piece emojis sit on a circle, with
 *  arrows from each piece to the one it kills. The Lion sits in the
 *  middle and has arrows out to ALL of them — the universal killer.
 *
 *  The whole ring (arrows + piece bubbles) rotates together via a CSS
 *  animation, and each bubble counter-rotates at the same rate so the
 *  emoji stays upright while it travels around. CSS keeps the two
 *  motions in lockstep; framer-motion would drift over minutes.
 *
 *  Tap any piece on the circle (or the centre Lion) to highlight its
 *  kill arrows + show a one-line plain-English rule under the wheel. */
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

interface Props {
  onPick?: (key: WedgeKey | 'lion') => void;
  selected?: WedgeKey | 'lion' | null;
}

export default function KillCycleWheel({ onPick, selected }: Props) {
  const { theme } = useSettings();
  const [hovered, setHovered] = useState<WedgeKey | 'lion' | null>(null);
  const [paused, setPaused] = useState(false);
  const active = hovered ?? selected ?? null;

  const idx: Record<WedgeKey, number> = {
    elephant: 0, ant: 1, butterfly: 2, bat: 3, monkey: 4,
  };

  // An arrow lights up when EITHER end of it is the active piece — so
  // tapping the Lion shows both the centre-out arrows AND the Elephant
  // arrow coming in, and tapping the Butterfly shows the Bat arrow
  // coming in. Without this, only outgoing arrows lit up and players
  // couldn't see "who beats me" at a glance.
  const isHot = (from: WedgeKey | 'lion', to: WedgeKey | 'lion') =>
    active != null && (active === from || active === to);

  return (
    <div
      className={`relative ${paused ? 'zi-cycle-paused' : ''}`}
      style={{ width: SIZE, height: SIZE, margin: '0 auto' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* Spinning ring. Holds both the arrow SVG and the piece bubbles,
          so they orbit together — pieces never drift away from the
          arrow tips. The bubbles inside counter-rotate to keep emojis
          upright. */}
      <div className="absolute inset-0 zi-cycle-spin">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
          <defs>
            {/* Soft glow under bright arrows — punchier than the
                previous build so a hot arrow stands out clearly. */}
            <filter id="zi-arrow-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker
              id="zi-arrow-bright"
              viewBox="0 0 12 12"
              refX="9" refY="6"
              markerWidth="8" markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 12 6 L 0 12 z" fill={theme.p1Color} />
            </marker>
            <marker
              id="zi-arrow-dim"
              viewBox="0 0 12 12"
              refX="9" refY="6"
              markerWidth="6" markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 12 6 L 0 12 z" fill={theme.textMuted} fillOpacity="0.35" />
            </marker>
          </defs>

          {/* Ring → ring arrows (skipping the elephant→lion which goes
              centre-in below). An arrow is "hot" if either of its
              endpoints is the active piece, so tapping a piece lights
              up everything that touches it — both who it beats and
              who beats it. */}
          {RING.map(p => {
            if (p.kills === 'lion') return null;
            const from = ringPoint(idx[p.key]);
            const to   = ringPoint(idx[p.kills]);
            const hot  = isHot(p.key, p.kills);
            const dx = to.x - from.x, dy = to.y - from.y;
            const len = Math.hypot(dx, dy);
            const tx = from.x + (dx / len) * (len - PIECE_RADIUS - 6);
            const ty = from.y + (dy / len) * (len - PIECE_RADIUS - 6);
            const sx = from.x + (dx / len) * (PIECE_RADIUS + 4);
            const sy = from.y + (dy / len) * (PIECE_RADIUS + 4);
            return (
              <line
                key={`ring-${p.key}`}
                x1={sx} y1={sy} x2={tx} y2={ty}
                stroke={hot ? theme.p1Color : theme.textMuted}
                strokeOpacity={hot ? 1 : 0.35}
                strokeWidth={hot ? 4 : 2}
                strokeLinecap="round"
                filter={hot ? 'url(#zi-arrow-glow)' : undefined}
                markerEnd={hot ? 'url(#zi-arrow-bright)' : 'url(#zi-arrow-dim)'}
              />
            );
          })}

          {/* Lion → all 5 ring pieces (centre-out). Drawn whenever the
              Lion is the focus, so the player sees "Lion beats anyone"
              at a glance. */}
          {active === 'lion' && RING.map(p => {
            const to = ringPoint(idx[p.key]);
            const dx = to.x - CENTER, dy = to.y - CENTER;
            const len = Math.hypot(dx, dy);
            const tx = CENTER + (dx / len) * (len - PIECE_RADIUS - 6);
            const ty = CENTER + (dy / len) * (len - PIECE_RADIUS - 6);
            const sx = CENTER + (dx / len) * (PIECE_RADIUS + 4);
            const sy = CENTER + (dy / len) * (PIECE_RADIUS + 4);
            return (
              <line
                key={`lion-${p.key}`}
                x1={sx} y1={sy} x2={tx} y2={ty}
                stroke={theme.p1Color}
                strokeOpacity={1}
                strokeWidth={4}
                strokeLinecap="round"
                filter="url(#zi-arrow-glow)"
                markerEnd="url(#zi-arrow-bright)"
              />
            );
          })}

          {/* Elephant → Lion (centre-in). Always drawn so the cycle
              never looks broken; brightens whenever EITHER endpoint is
              the active piece — i.e. tapping Lion shows the "back"
              arrow from Elephant, exactly the bidirectional behaviour
              the lesson needs. */}
          {(() => {
            const from = ringPoint(idx.elephant);
            const dx = CENTER - from.x, dy = CENTER - from.y;
            const len = Math.hypot(dx, dy);
            const sx = from.x + (dx / len) * (PIECE_RADIUS + 4);
            const sy = from.y + (dy / len) * (PIECE_RADIUS + 4);
            const tx = from.x + (dx / len) * (len - PIECE_RADIUS - 8);
            const ty = from.y + (dy / len) * (len - PIECE_RADIUS - 8);
            const hot = isHot('elephant', 'lion');
            return (
              <line
                x1={sx} y1={sy} x2={tx} y2={ty}
                stroke={hot ? theme.p1Color : theme.textMuted}
                strokeOpacity={hot ? 1 : 0.35}
                strokeWidth={hot ? 4 : 2}
                strokeLinecap="round"
                filter={hot ? 'url(#zi-arrow-glow)' : undefined}
                markerEnd={hot ? 'url(#zi-arrow-bright)' : 'url(#zi-arrow-dim)'}
              />
            );
          })()}
        </svg>

        {/* Piece bubbles — counter-rotating so the emoji stays upright. */}
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
              className="absolute rounded-full inline-flex items-center justify-center transition-colors zi-cycle-spin-back"
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
      </div>

      {/* Lion at centre — static, never rotates with the ring. The
          universal killer is the still point the rest revolves around. */}
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
