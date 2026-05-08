'use client';
import { GameState } from '@/game/types';
import BoardCell from './BoardCell';
import BoardDecor from './BoardDecor';
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
}

export default function GameBoard({ state, cellSize, onCellClick, tutorialHighlight }: Props) {
  const { pieces, selectedPieceId, validMoves, bounceEffect } = state;
  const { theme } = useSettings();
  const labelColor = `color-mix(in srgb, ${theme.textPrimary} 30%, transparent)`;

  return (
    <div className="flex flex-col items-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
      </div>
    </div>
  );
}
