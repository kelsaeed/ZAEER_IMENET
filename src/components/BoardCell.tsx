'use client';
import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GamePiece, Position, BounceEffect } from '@/game/types';
import { isThrone, isBarrier } from '@/game/constants';
import { getAntCells, getPiecesAtCell } from '@/game/logic';
import { useSettings } from '@/hooks/useSettings';
import PieceDisplay from './PieceDisplay';

interface Props {
  row: number;
  col: number;
  allPieces: GamePiece[];
  selectedPieceId: string | null;
  validMoves: Position[];
  bounceEffect?: BounceEffect;
  onClick: (row: number, col: number) => void;
  cellSize: number;
}

function BoardCellImpl({
  row, col, allPieces, selectedPieceId, validMoves, bounceEffect, onClick, cellSize
}: Props) {
  const handleClick = () => onClick(row, col);
  const { theme } = useSettings();
  const throne = isThrone(row, col);
  const barrier = isBarrier(row, col);
  const isValidMove = validMoves.some(m => m.row === row && m.col === col);
  const isEven = (row + col) % 2 === 0;

  const piecesHere = getPiecesAtCell(allPieces, row, col);

  // Determine main piece and overlay
  // Main piece: not the butterfly/bat overlay; overlay piece: shielding or paralyzing
  const mainPiece = piecesHere.find(p => !p.shielding && !p.paralyzing) ?? piecesHere[0];
  const overlayPiece = piecesHere.find(p => p.shielding !== undefined || p.paralyzing !== undefined);

  const isAntCenter = mainPiece?.type === 'ant' && mainPiece.row === row && mainPiece.col === col;
  const isSelected = !!(mainPiece && selectedPieceId === mainPiece.id);

  // Check if this cell is an ant WING (not center)
  const isAntWing = !isAntCenter && mainPiece?.type === 'ant' &&
    getAntCells(mainPiece.row, mainPiece.col, mainPiece.orientation!).some(
      c => c.row === row && c.col === col && !(c.row === mainPiece.row && c.col === mainPiece.col)
    );

  let baseBg = isEven ? theme.cellLight : theme.cellDark;
  if (throne) baseBg = theme.throneBg;
  if (barrier) baseBg = theme.barrierBg;
  // Ant wing cells get a subtle tint matching the player's accent
  if (isAntWing && !barrier) baseBg = mainPiece?.player === 1
    ? `color-mix(in srgb, ${theme.p1Color} 10%, ${isEven ? theme.cellLight : theme.cellDark})`
    : `color-mix(in srgb, ${theme.p2Color} 10%, ${isEven ? theme.cellLight : theme.cellDark})`;

  // Throne: rich radial dome — bright at the centre, deeper at the edges.
  // Regular cells: subtle vertical gradient for depth.
  let cellBg: string;
  if (throne) {
    cellBg =
      `radial-gradient(circle at 50% 35%, ` +
        `color-mix(in srgb, white 35%, ${baseBg}) 0%, ` +
        `${baseBg} 45%, ` +
        `color-mix(in srgb, black 30%, ${baseBg}) 100%)`;
  } else if (barrier) {
    cellBg = baseBg;
  } else {
    cellBg = `linear-gradient(180deg, color-mix(in srgb, white 6%, ${baseBg}) 0%, ${baseBg} 50%, color-mix(in srgb, black 8%, ${baseBg}) 100%)`;
  }

  const borderColor = throne ? theme.throneBorder : barrier ? theme.barrierBorder : 'rgba(255,255,255,0.06)';

  return (
    <motion.div
      className="relative flex items-center justify-center cursor-pointer touch-manipulation select-none"
      style={{
        width: cellSize,
        height: cellSize,
        minWidth: cellSize,
        minHeight: cellSize,
        background: cellBg,
        border: `1px solid ${borderColor}`,
        boxSizing: 'border-box',
        WebkitTapHighlightColor: 'transparent',
        boxShadow: throne
          ? `inset 0 0 ${cellSize * 0.4}px ${theme.throneBorder}, 0 0 12px color-mix(in srgb, ${theme.throneBg} 50%, transparent)`
          : undefined,
      }}
      onClick={handleClick}
    >
      {/* Throne glow */}
      {throne && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: theme.throneGlow }}
        />
      )}

      {/* Barrier pattern */}
      {barrier && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
          <span style={{ fontSize: cellSize * 0.35 }}>🌿</span>
        </div>
      )}

      {/* Ant wing visual — subtle stripe */}
      {isAntWing && !barrier && (
        <div className="absolute inset-0 pointer-events-none"
          style={{
            background: `repeating-linear-gradient(45deg, color-mix(in srgb, ${mainPiece?.player === 1 ? theme.p1Color : theme.p2Color} 6%, transparent) 0px, color-mix(in srgb, ${mainPiece?.player === 1 ? theme.p1Color : theme.p2Color} 6%, transparent) 2px, transparent 2px, transparent 6px)`,
          }}
        />
      )}

      {/* Valid move indicator */}
      <AnimatePresence>
        {isValidMove && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          >
            <motion.div
              animate={{ scale: [0.55, 0.75, 0.55] }}
              transition={{ duration: 1.3, repeat: Infinity }}
              style={{
                width: piecesHere.length > 0 ? cellSize - 2 : cellSize * 0.36,
                height: piecesHere.length > 0 ? cellSize - 2 : cellSize * 0.36,
                background: piecesHere.length > 0 ? theme.attackFill : theme.validMoveFill,
                border: piecesHere.length > 0 ? `2px solid ${theme.attackBorder}` : `2px solid ${theme.validMoveBorder}`,
                borderRadius: piecesHere.length > 0 ? '4px' : '50%',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Piece */}
      {mainPiece && !barrier && (
        <motion.div
          key={`${mainPiece.id}-${row}-${col}`}
          layoutId={`${mainPiece.id}-${isAntCenter ? 'center' : `wing-${row}-${col}`}`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="z-20 flex items-center justify-center"
        >
          <PieceDisplay
            piece={mainPiece}
            isCenter={mainPiece.type !== 'ant' || isAntCenter}
            isSelected={isSelected}
            size={cellSize}
            overlay={overlayPiece}
            bounceEffect={bounceEffect}
          />
        </motion.div>
      )}
    </motion.div>
  );
}

// allPieces is recomputed each render in the parent (state.pieces); React.memo's
// shallow compare is enough — when the array reference is the same (no state
// change), all 256 cells skip re-render. The piecesAtCell computation inside
// is cheap (filter over ~24 pieces), but skipping reconciliation is the win.
const BoardCell = memo(BoardCellImpl);
export default BoardCell;
