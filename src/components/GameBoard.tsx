'use client';
import { GameState } from '@/game/types';
import BoardCell from './BoardCell';
import { BOARD_SIZE, colLabel, rowLabel } from '@/game/constants';
import { useSettings } from '@/hooks/useSettings';

interface Props {
  state: GameState;
  cellSize: number;
  onCellClick: (row: number, col: number) => void;
}

export default function GameBoard({ state, cellSize, onCellClick }: Props) {
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
      </div>
    </div>
  );
}
