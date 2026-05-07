'use client';
import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GamePiece, Position, BounceEffect } from '@/game/types';
import { isThrone, isBarrier } from '@/game/constants';
import { getAntCells, getPiecesAtCell } from '@/game/logic';
import { useSettings } from '@/hooks/useSettings';
import { usePlayerThemes, themeForRow } from '@/hooks/usePlayerThemes';
import PieceDisplay from './PieceDisplay';

// Stable references for the valid-move pulse so framer-motion doesn't restart
// the loop on every re-render (was a visible flicker during resize / zoom).
// (Not using `as const` — framer-motion's prop types want mutable arrays.)
const VALID_MOVE_INITIAL = { opacity: 0, scale: 0.5 };
const VALID_MOVE_ANIMATE = { opacity: 1, scale: 1 };
const VALID_MOVE_EXIT = { opacity: 0, scale: 0.5 };
const VALID_MOVE_PULSE = { scale: [0.55, 0.75, 0.55] };
const VALID_MOVE_PULSE_TRANSITION = { duration: 1.3, repeat: Infinity };

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
  const { theme: viewerTheme } = useSettings();
  const playerThemes = usePlayerThemes();
  // Cell BACKGROUND comes from the territory-owning player's theme so
  // each half of the board carries that player's chosen palette. Throne
  // / barrier accents (gold throne dome, etc.) also flow from the same
  // territory-owning theme — keeps the look coherent within each half.
  const territoryTheme = themeForRow(playerThemes, row);
  // Piece accent (border, glow, selected ring, ant-wing tint) follows
  // the PIECE OWNER's theme regardless of where the piece is currently
  // standing — your gold lion stays gold even when it sneaks into the
  // opponent's half.
  const pieceAccent = (player: 1 | 2) =>
    player === 1 ? playerThemes.p1 : playerThemes.p2;
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

  let baseBg = isEven ? territoryTheme.cellLight : territoryTheme.cellDark;
  if (throne) baseBg = territoryTheme.throneBg;
  if (barrier) baseBg = territoryTheme.barrierBg;
  // Ant wing cells get a subtle tint matching the OWNING piece's accent
  // (so a gold ant snaking into the opponent's half still leaves a
  // subtle gold trail, not the opponent's tint).
  if (isAntWing && !barrier && mainPiece) {
    const wingAccent = pieceAccent(mainPiece.player);
    const accentColor = mainPiece.player === 1 ? wingAccent.p1Color : wingAccent.p2Color;
    baseBg = `color-mix(in srgb, ${accentColor} 10%, ${isEven ? territoryTheme.cellLight : territoryTheme.cellDark})`;
  }

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

  const borderColor = throne
    ? territoryTheme.throneBorder
    : barrier ? territoryTheme.barrierBorder : 'rgba(255,255,255,0.06)';

  return (
    <div
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
          ? `inset 0 0 ${cellSize * 0.4}px ${territoryTheme.throneBorder}, 0 0 12px color-mix(in srgb, ${territoryTheme.throneBg} 50%, transparent)`
          : undefined,
      }}
      onClick={handleClick}
    >
      {/* Throne glow */}
      {throne && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: territoryTheme.throneGlow }}
        />
      )}

      {/* Barrier pattern */}
      {barrier && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
          <span style={{ fontSize: cellSize * 0.35 }}>🌿</span>
        </div>
      )}

      {/* Ant wing visual — subtle stripe in the OWNING piece's accent. */}
      {isAntWing && !barrier && mainPiece && (() => {
        const accentTheme = pieceAccent(mainPiece.player);
        const wingColor = mainPiece.player === 1 ? accentTheme.p1Color : accentTheme.p2Color;
        return (
          <div className="absolute inset-0 pointer-events-none"
            style={{
              background: `repeating-linear-gradient(45deg, color-mix(in srgb, ${wingColor} 6%, transparent) 0px, color-mix(in srgb, ${wingColor} 6%, transparent) 2px, transparent 2px, transparent 6px)`,
            }}
          />
        );
      })()}

      {/* Valid move indicator — uses the VIEWER's theme so the
          highlights stay legible regardless of which half is themed
          which way (a target square in the opponent's half should
          read the same as one on your side). */}
      <AnimatePresence>
        {isValidMove && (
          <motion.div
            initial={VALID_MOVE_INITIAL}
            animate={VALID_MOVE_ANIMATE}
            exit={VALID_MOVE_EXIT}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          >
            <motion.div
              animate={VALID_MOVE_PULSE}
              transition={VALID_MOVE_PULSE_TRANSITION}
              style={{
                width: piecesHere.length > 0 ? cellSize - 2 : cellSize * 0.36,
                height: piecesHere.length > 0 ? cellSize - 2 : cellSize * 0.36,
                background: piecesHere.length > 0 ? viewerTheme.attackFill : viewerTheme.validMoveFill,
                border: piecesHere.length > 0
                  ? `2px solid ${viewerTheme.attackBorder}`
                  : `2px solid ${viewerTheme.validMoveBorder}`,
                borderRadius: piecesHere.length > 0 ? '4px' : '50%',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Piece — instant snap on a state change. We removed the framer-motion
          layoutId/animation entirely after the user reported pieces still
          felt glitchy and slow on mobile (the layout transition was driving
          a JS-per-frame transform on top of the React reconciliation, which
          was the root cause). Pieces now move like chess pieces: simply
          appear at the new cell. */}
      {mainPiece && !barrier && (
        <div
          key={mainPiece.id}
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
        </div>
      )}
    </div>
  );
}

// allPieces is recomputed each render in the parent (state.pieces); React.memo's
// shallow compare is enough — when the array reference is the same (no state
// change), all 256 cells skip re-render. The piecesAtCell computation inside
// is cheap (filter over ~24 pieces), but skipping reconciliation is the win.
const BoardCell = memo(BoardCellImpl);
export default BoardCell;
