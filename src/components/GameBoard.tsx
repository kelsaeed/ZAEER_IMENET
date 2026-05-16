'use client';
import { GameState } from '@/game/types';
import BoardCell from './BoardCell';
import BoardDecor from './BoardDecor';
import RotationHint from './RotationHint';
import { BOARD_SIZE, colLabel, rowLabel } from '@/game/constants';
import { useSettings } from '@/hooks/useSettings';

interface Props {
  state: GameState;
  cellSize: number;
  onCellClick: (row: number, col: number) => void;
  /** Tutorial-only: paints a pulsing ring on top of this cell so a
   *  first-timer sees exactly where to tap next. Lives inside the
   *  GameBoard so the offsets stay in lockstep with the grid as the
   *  cell size resizes — much simpler than positioning an external
   *  overlay against a fragile column-label height. */
  tutorialHighlight?: { row: number; col: number } | null;
  /** Secondary, calmer pulses used by callout lessons to point at
   *  "notice this" squares (e.g. the throne you can't stop on, or the
   *  cell a rotated ant wing will block). Rendered in the opponent
   *  accent so they read as "observe", distinct from the bright
   *  "tap here" primary highlight. */
  extraHighlights?: { row: number; col: number }[];
  /** When set, paints a large clickable down-arrow over the given
   *  cell as a hint that rotation / end-turn buttons live in the HUD
   *  below the board. Tapping it fires onRotationHintClick — the
   *  parent should smooth-scroll to the rotation section. */
  rotationHintAt?: { row: number; col: number } | null;
  onRotationHintClick?: () => void;
  /** UI-tour only: numbered chips pinned to specific cells. Rendered
   *  inside the grid (same offset math as the tutorial pulse) so they
   *  track the cells exactly as the board resizes — far more reliable
   *  than guessing percentages against the outer wrapper, which also
   *  has to account for the column-label row's variable height. */
  tourBadges?: { n: number; row: number; col: number }[];
}

export default function GameBoard({
  state, cellSize, onCellClick, tutorialHighlight, extraHighlights,
  rotationHintAt, onRotationHintClick, tourBadges,
}: Props) {
  const { pieces, selectedPieceId, validMoves, bounceEffect } = state;
  const { theme } = useSettings();
  const labelColor = `color-mix(in srgb, ${theme.textPrimary} 30%, transparent)`;

  return (
    // The board is a coordinate grid (chess-style A..P / 16..1). It must
    // NOT mirror in Arabic/RTL — column A always sits on the left for
    // everyone, otherwise the absolutely-positioned overlays (tutorial
    // pulse, rotation hint) and the flex-laid cells disagree and the
    // highlights land on the wrong squares. Forcing dir="ltr" on the
    // board container keeps the grid identical in both layouts; only the
    // surrounding page text follows the locale direction.
    <div
      dir="ltr"
      className="flex flex-col items-center"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
    >
      {/* Column labels — chess-style A..P */}
      <div className="flex" style={{ display: 'flex', paddingLeft: cellSize * 0.5 }}>
        {Array.from({ length: BOARD_SIZE }).map((_, c) => (
          <div
            key={c}
            style={{
              width: cellSize,
              textAlign: 'center',
              fontSize: Math.max(10, cellSize * 0.22),
              fontWeight: 600,
              color: labelColor,
              letterSpacing: 0.5,
            }}
          >
            {colLabel(c)}
          </div>
        ))}
      </div>

      {/* Board grid */}
      <div
        className="flex flex-col"
        style={{
          display: 'flex',
          flexDirection: 'column',
          border: `2px solid ${theme.boardBorder}`,
          borderRadius: 8,
          background: theme.boardBg,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.04), 0 12px 40px rgba(0,0,0,0.45), inset 0 0 24px rgba(0,0,0,0.35)`,
          overflow: 'hidden',
          // The tutorial pulse (if any) is positioned absolutely against
          // this container — keeping the parent `relative` is what makes
          // the cell-aligned offsets simple.
          position: 'relative',
          // Block the page from scrolling/zooming when the user drags a
          // finger across the board. Taps still register; the rest of the
          // page (HUD, top bar) remains scrollable normally.
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
      >
        {Array.from({ length: BOARD_SIZE }).map((_, row) => (
          <div key={row} className="flex" style={{ display: 'flex' }}>
            {/* Row label — chess-style 16..1 (top to bottom) */}
            <div
              style={{
                width: cellSize * 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: Math.max(10, cellSize * 0.22),
                fontWeight: 600,
                color: labelColor,
              }}
            >
              {rowLabel(row)}
            </div>

            {Array.from({ length: BOARD_SIZE }).map((_, col) => (
              <BoardCell
                key={`${row}-${col}`}
                row={row}
                col={col}
                allPieces={pieces}
                selectedPieceId={selectedPieceId}
                validMoves={validMoves}
                bounceEffect={bounceEffect}
                onClick={onCellClick}
                cellSize={cellSize}
              />
            ))}
          </div>
        ))}

        {/* Premium-theme decor (sparkles + diagonals) scoped to each
            player's half. Sits inside the board container so both
            viewers see the same animations on the same half — the
            celestial player's territory looks magical from either
            seat at the table. Pointer-events: none + screen blend so
            it never intercepts taps and never washes out pieces. */}
        <BoardDecor cellSize={cellSize} />

        {/* Secondary "notice this" pulses (callout lessons). Calmer than
            the primary highlight and tinted with the opponent accent so
            they read as observe-don't-tap. */}
        {extraHighlights?.map(h => (
          <div
            key={`xh-${h.row}-${h.col}`}
            aria-hidden
            className="absolute pointer-events-none rounded-md zi-tutorial-pulse"
            style={{
              top: h.row * cellSize,
              left: 0.5 * cellSize + h.col * cellSize,
              width: cellSize,
              height: cellSize,
              boxSizing: 'border-box',
              border: `3px dashed ${theme.p2Color}`,
              boxShadow: `0 0 12px ${theme.p2Color}99, inset 0 0 10px ${theme.p2Color}40`,
              zIndex: 4,
            }}
          />
        ))}

        {/* Tutorial pulse — soft glowing ring on the lesson cell. */}
        {tutorialHighlight && (
          <div
            aria-hidden
            className="absolute pointer-events-none rounded-md zi-tutorial-pulse"
            style={{
              top: tutorialHighlight.row * cellSize,
              left: 0.5 * cellSize + tutorialHighlight.col * cellSize,
              width: cellSize,
              height: cellSize,
              boxSizing: 'border-box',
              border: `3px solid ${theme.p1Color}`,
              boxShadow: `0 0 18px ${theme.p1Color}, inset 0 0 14px ${theme.p1Color}66`,
              zIndex: 5,
            }}
          />
        )}

        {/* UI-tour numbered chips — centred on their cell, clamped so
            they stay fully inside the grid even at the corners. The
            legend that explains the numbers lives in tutorial.tour.body. */}
        {tourBadges?.map(b => {
          const gw = 0.5 * cellSize + BOARD_SIZE * cellSize;
          const gh = BOARD_SIZE * cellSize;
          const left = Math.max(2, Math.min(0.5 * cellSize + b.col * cellSize + cellSize / 2 - 11, gw - 24));
          const top = Math.max(2, Math.min(b.row * cellSize + cellSize / 2 - 11, gh - 24));
          return (
            <div
              key={`tb-${b.n}`}
              aria-hidden
              className="absolute z-20 rounded-full flex items-center justify-center font-extrabold pointer-events-none"
              style={{
                top,
                left,
                width: 22,
                height: 22,
                fontSize: 12,
                background: theme.p1Color,
                color: '#000',
                boxShadow: `0 0 10px ${theme.p1Color}, 0 1px 3px rgba(0,0,0,0.5)`,
              }}
            >
              {b.n}
            </div>
          );
        })}

        {/* "Pick direction below" hint — large clickable down-arrow
            anchored on the ant's centre cell. Drawn in SVG so it
            scales crisply with cellSize and inherits theme accents. */}
        {rotationHintAt && onRotationHintClick && (
          <RotationHint
            visible
            cellSize={cellSize}
            antRow={rotationHintAt.row}
            antCol={rotationHintAt.col}
            onClick={onRotationHintClick}
          />
        )}
      </div>
    </div>
  );
}
