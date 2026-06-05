'use client';
import { useSettings } from '@/hooks/useSettings';

/** "Who beats who" — the kill cycle, drawn as a fixed diagram that
 *  orbits gently as decoration. No clicking, no hover, no two-colour
 *  state. Every arrow is the same yellow; the Lion ↔ Elephant pair
 *  shares ONE arrow with heads on both ends, since they kill each
 *  other (Lion kills any enemy; Elephant kills the Lion in the cycle). */
type WedgeKey = 'elephant' | 'ant' | 'butterfly' | 'bat' | 'monkey';

interface Piece {
  key: WedgeKey;
  emoji: string;
}

const RING: Piece[] = [
  { key: 'elephant',  emoji: '🐘' },
  { key: 'ant',       emoji: '🐜' },
  { key: 'butterfly', emoji: '🦋' },
  { key: 'bat',       emoji: '🦇' },
  { key: 'monkey',    emoji: '🐒' },
];

const SIZE         = 320;
const CENTER       = SIZE / 2;
const RADIUS       = 120;
const PIECE_RADIUS = 28;
const LION_RADIUS  = PIECE_RADIUS + 5;   // 33
const RING_GAP     = PIECE_RADIUS + 6;   // 34 — line stops just outside a ring bubble
const LION_GAP     = LION_RADIUS + 6;    // 39 — line stops just outside the bigger lion bubble

const ARROW_COLOR  = '#fbbf24';          // single warm yellow for every arrow
const STROKE       = 3;                  // thinner than before so the wheel isn't shouting

function ringPoint(i: number) {
  const angle = (i / RING.length) * Math.PI * 2 - Math.PI / 2;
  return {
    x: CENTER + Math.cos(angle) * RADIUS,
    y: CENTER + Math.sin(angle) * RADIUS,
  };
}

/** Cycle relationships: who → who in the ring. Lion is universal but
 *  drawn separately. The Elephant entry is intentionally absent —
 *  Elephant↔Lion is the bidirectional arrow rendered last. */
const CYCLE: Record<Exclude<WedgeKey, 'elephant'>, WedgeKey> = {
  ant:       'elephant',  // ant kills elephant
  butterfly: 'ant',       // butterfly kills ant
  bat:       'butterfly', // bat kills butterfly
  monkey:    'bat',       // monkey kills bat
};

const idx: Record<WedgeKey, number> = {
  elephant: 0, ant: 1, butterfly: 2, bat: 3, monkey: 4,
};

// Compatibility props: the wheel used to take onPick + selected when
// it was interactive. The tutorial page still passes those; we ignore
// them now that the diagram is purely decorative.
interface Props {
  onPick?: (key: WedgeKey | 'lion') => void;
  selected?: WedgeKey | 'lion' | null;
}

export default function KillCycleWheel(_props: Props) {
  const { theme } = useSettings();

  return (
    <div
      className="relative"
      style={{ width: SIZE, height: SIZE, margin: '0 auto' }}
    >
      {/* Spinning ring carries arrows + piece bubbles together so they
          stay aligned. Each bubble counter-rotates so the emoji stays
          upright while it orbits. The Lion sits in the OUTER (non-
          rotating) layer at the centre. */}
      <div className="absolute inset-0 zi-cycle-spin">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
          <defs>
            {/* Smaller arrowhead than the previous build (5×5 vs 8×8)
                so the heads sit gracefully at the line ends instead of
                dominating short arrows. */}
            <marker
              id="zi-arrow-head"
              viewBox="0 0 10 10"
              refX="8" refY="5"
              markerWidth="5" markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={ARROW_COLOR} />
            </marker>
          </defs>

          {/* Ring → ring arrows (4 of them: ant→elephant, butterfly→ant,
              bat→butterfly, monkey→bat). The elephant→lion direction
              is rolled into the bidirectional arrow below. */}
          {(Object.keys(CYCLE) as Array<keyof typeof CYCLE>).map(fromKey => {
            const toKey = CYCLE[fromKey];
            const from  = ringPoint(idx[fromKey]);
            const to    = ringPoint(idx[toKey]);
            const dx = to.x - from.x, dy = to.y - from.y;
            const len = Math.hypot(dx, dy);
            const sx = from.x + (dx / len) * RING_GAP;
            const sy = from.y + (dy / len) * RING_GAP;
            const tx = from.x + (dx / len) * (len - RING_GAP);
            const ty = from.y + (dy / len) * (len - RING_GAP);
            return (
              <line
                key={`ring-${fromKey}`}
                x1={sx} y1={sy} x2={tx} y2={ty}
                stroke={ARROW_COLOR}
                strokeWidth={STROKE}
                strokeLinecap="round"
                markerEnd="url(#zi-arrow-head)"
              />
            );
          })}

          {/* Lion → ring arrows (4: lion to ant, butterfly, bat, monkey).
              The lion→elephant direction is part of the Elephant↔Lion
              two-headed arrow below — drawing it here would put two
              arrows on the same line. */}
          {RING.filter(p => p.key !== 'elephant').map(p => {
            const to = ringPoint(idx[p.key]);
            const dx = to.x - CENTER, dy = to.y - CENTER;
            const len = Math.hypot(dx, dy);
            const sx = CENTER + (dx / len) * LION_GAP;
            const sy = CENTER + (dy / len) * LION_GAP;
            const tx = CENTER + (dx / len) * (len - RING_GAP);
            const ty = CENTER + (dy / len) * (len - RING_GAP);
            return (
              <line
                key={`lion-${p.key}`}
                x1={sx} y1={sy} x2={tx} y2={ty}
                stroke={ARROW_COLOR}
                strokeWidth={STROKE}
                strokeLinecap="round"
                markerEnd="url(#zi-arrow-head)"
              />
            );
          })}

          {/* Elephant ↔ Lion: ONE arrow with arrowheads at BOTH ends.
              The Lion kills any enemy (so it kills the Elephant), and
              the Elephant kills the Lion (cycle), so this matchup goes
              both ways and the diagram captures it with a single
              two-headed line. */}
          {(() => {
            const from = ringPoint(idx.elephant);
            const dx = CENTER - from.x, dy = CENTER - from.y;
            const len = Math.hypot(dx, dy);
            const sx = from.x + (dx / len) * RING_GAP;
            const sy = from.y + (dy / len) * RING_GAP;
            const tx = from.x + (dx / len) * (len - LION_GAP);
            const ty = from.y + (dy / len) * (len - LION_GAP);
            return (
              <line
                x1={sx} y1={sy} x2={tx} y2={ty}
                stroke={ARROW_COLOR}
                strokeWidth={STROKE}
                strokeLinecap="round"
                markerStart="url(#zi-arrow-head)"
                markerEnd="url(#zi-arrow-head)"
              />
            );
          })()}
        </svg>

        {/* Piece bubbles. No buttons / no click handlers — purely
            decorative. Each counter-rotates so the emoji stays upright
            while the bubble orbits. */}
        {RING.map(p => {
          const pos = ringPoint(idx[p.key]);
          return (
            <div
              key={p.key}
              className="absolute rounded-full inline-flex items-center justify-center zi-cycle-spin-back"
              style={{
                width:  PIECE_RADIUS * 2,
                height: PIECE_RADIUS * 2,
                left:   pos.x - PIECE_RADIUS,
                top:    pos.y - PIECE_RADIUS,
                background: theme.panelBg,
                border: `2px solid ${theme.panelBorder}`,
                boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
              }}
            >
              <span aria-hidden style={{ fontSize: 28, lineHeight: 1 }}>{p.emoji}</span>
            </div>
          );
        })}
      </div>

      {/* Lion at the centre — static, doesn't orbit. The universal
          killer is the still point the cycle revolves around. */}
      <div
        className="absolute rounded-full inline-flex items-center justify-center"
        style={{
          width:  PIECE_RADIUS * 2 + 10,
          height: PIECE_RADIUS * 2 + 10,
          left:   CENTER - PIECE_RADIUS - 5,
          top:    CENTER - PIECE_RADIUS - 5,
          background: theme.panelBg,
          border: `3px solid ${theme.p1AccentBorder}`,
          // Inset glow only — no outer halo that would bleed into the
          // arrow zone and obscure the yellow lines passing nearby.
          boxShadow: `inset 0 0 10px ${theme.p1Color}55`,
        }}
      >
        <span aria-hidden style={{ fontSize: 32, lineHeight: 1 }}>🦁</span>
      </div>
    </div>
  );
}

export type { WedgeKey };
