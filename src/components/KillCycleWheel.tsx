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

// Red for "what this piece kills" (outgoing) — the aggressive direction.
// Yellow for "what kills this piece" (incoming) — the warning direction.
// Picked for high contrast against the dark background AND from each
// other, so a glance tells you which is which without reading labels.
const COLOR_OUT  = '#ef4444';   // bright red
const COLOR_IN   = '#fbbf24';   // sunny yellow

export default function KillCycleWheel({ onPick, selected }: Props) {
  const { theme } = useSettings();
  const [hovered, setHovered] = useState<WedgeKey | 'lion' | null>(null);
  // Selection STICKS — clicking a piece locks the wheel to that piece's
  // arrows even as the cursor moves. Hover only previews when nothing
  // has been picked yet. Earlier behaviour (`hovered ?? selected`) let
  // a stray hover hijack the focus right after a click, which was
  // really confusing when reading the body card.
  const active = selected ?? hovered ?? null;

  const idx: Record<WedgeKey, number> = {
    elephant: 0, ant: 1, butterfly: 2, bat: 3, monkey: 4,
  };

  // For each arrow, decide whether it's "outgoing" from the active
  // piece (shows what the active piece kills — red), "incoming" to it
  // (shows what kills the active piece — yellow), or unrelated (dim).
  type ArrowState = 'out' | 'in' | 'dim';
  const arrowState = (from: WedgeKey | 'lion', to: WedgeKey | 'lion'): ArrowState => {
    if (active === from) return 'out';
    if (active === to)   return 'in';
    return 'dim';
  };

  return (
    <div
      className="relative"
      style={{ width: SIZE, height: SIZE, margin: '0 auto' }}
    >
      {/* Spinning ring. Holds both the arrow SVG and the piece bubbles,
          so they orbit together — pieces never drift away from the
          arrow tips. The bubbles inside counter-rotate to keep emojis
          upright. */}
      <div className="absolute inset-0 zi-cycle-spin">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
          <defs>
            <filter id="zi-arrow-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Three coloured arrowheads. The marker fill must match the
                line stroke for the join between line + head to look
                continuous. */}
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
              <path d="M 0 0 L 12 6 L 0 12 z" fill={theme.textMuted} fillOpacity="0.35" />
            </marker>
          </defs>

          {/* Ring → ring arrows (skipping the elephant→lion which goes
              centre-in below). Each arrow's colour reflects whether
              it's the active piece's outgoing kill (red) or incoming
              death (yellow), or unrelated (dim grey). */}
          {RING.map(p => {
            if (p.kills === 'lion') return null;
            const from = ringPoint(idx[p.key]);
            const to   = ringPoint(idx[p.kills]);
            const st   = arrowState(p.key, p.kills);
            const dx = to.x - from.x, dy = to.y - from.y;
            const len = Math.hypot(dx, dy);
            const tx = from.x + (dx / len) * (len - PIECE_RADIUS - 6);
            const ty = from.y + (dy / len) * (len - PIECE_RADIUS - 6);
            const sx = from.x + (dx / len) * (PIECE_RADIUS + 4);
            const sy = from.y + (dy / len) * (PIECE_RADIUS + 4);
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
                strokeOpacity={st === 'dim' ? 0.35 : 1}
                strokeWidth={st === 'dim' ? 2 : 4}
                strokeLinecap="round"
                filter={st === 'dim' ? undefined : 'url(#zi-arrow-glow)'}
                markerEnd={`url(#${markerId})`}
              />
            );
          })}

          {/* Lion → ring arrows (centre-out). Drawn in two cases:
                – ALL FIVE in red when Lion is active (Lion kills any
                  enemy, so the wheel shows the universal-killer bouquet).
                – ONE in yellow (lion→activePiece) when ANY ring piece
                  is active. The Lion is a universal killer, so it's
                  always an incoming threat to whoever's selected — in
                  addition to whatever cycle-specific killer that piece
                  has on the ring. So Elephant active shows two yellow
                  arrows (ant→elephant cycle + lion→elephant universal),
                  Butterfly active shows two yellow (bat→butterfly +
                  lion→butterfly), and so on. */}
          {RING.map(p => {
            const lionIsActive  = active === 'lion';
            const pieceIsActive = active === p.key;
            if (!lionIsActive && !pieceIsActive) return null;

            const to = ringPoint(idx[p.key]);
            const dx = to.x - CENTER, dy = to.y - CENTER;
            const len = Math.hypot(dx, dy);
            const tx = CENTER + (dx / len) * (len - PIECE_RADIUS - 6);
            const ty = CENTER + (dy / len) * (len - PIECE_RADIUS - 6);
            const sx = CENTER + (dx / len) * (PIECE_RADIUS + 4);
            const sy = CENTER + (dy / len) * (PIECE_RADIUS + 4);
            const stroke   = lionIsActive ? COLOR_OUT : COLOR_IN;
            const markerId = lionIsActive ? 'zi-arrow-out' : 'zi-arrow-in';
            return (
              <line
                key={`lion-${p.key}`}
                x1={sx} y1={sy} x2={tx} y2={ty}
                stroke={stroke}
                strokeOpacity={1}
                strokeWidth={4}
                strokeLinecap="round"
                filter="url(#zi-arrow-glow)"
                markerEnd={`url(#${markerId})`}
              />
            );
          })}

          {/* Elephant → Lion (centre-in). Always drawn. When Elephant
              is active, this is its OUTGOING (red); when Lion is
              active, this is its INCOMING (yellow). Otherwise dim. */}
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
            return (
              <line
                x1={sx} y1={sy} x2={tx} y2={ty}
                stroke={stroke}
                strokeOpacity={st === 'dim' ? 0.35 : 1}
                strokeWidth={st === 'dim' ? 2 : 4}
                strokeLinecap="round"
                filter={st === 'dim' ? undefined : 'url(#zi-arrow-glow)'}
                markerEnd={`url(#${markerId})`}
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
