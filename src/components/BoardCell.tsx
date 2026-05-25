'use client';
import { memo } from 'react';
import { GamePiece, BounceEffect } from '@/game/types';
import { isThrone, isBarrier } from '@/game/constants';
import { getAntCells } from '@/game/logic';
import { pickMainPiece, pickOverlayPiece } from '@/game/boardLayout';
import { useSettings } from '@/hooks/useSettings';
import { usePlayerThemes, themeForRow } from '@/hooks/usePlayerThemes';
import { bumpCellRender } from './boardRenderCount';
import PieceDisplay from './PieceDisplay';

interface Props {
  row: number;
  col: number;
  /** Pieces occupying THIS cell (centre for non-ants; centre + wings for
   *  ants), precomputed and memoized by GameBoard. A stable reference across
   *  unrelated state changes is what lets React.memo skip this cell. */
  piecesHere: readonly GamePiece[];
  /** Whether this cell's main piece is the selected one. Computed in
   *  GameBoard from the same `pickMainPiece` rule used here, so the value is
   *  identical to the old `selectedPieceId === mainPiece.id` check. */
  isSelected: boolean;
  /** Whether this cell is a legal move/attack target this turn. */
  isValidMove: boolean;
  bounceEffect?: BounceEffect;
  onClick: (row: number, col: number) => void;
  cellSize: number;
}

function BoardCellImpl({
  row, col, piecesHere, isSelected, isValidMove, bounceEffect, onClick, cellSize
}: Props) {
  bumpCellRender(); // dev-only render tally (no-op unless zaeer.perf is set)
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
  const isEven = (row + col) % 2 === 0;

  // Determine main piece and overlay (same selection rule as before, now a
  // shared pure helper so GameBoard's isSelected computation can't drift).
  const mainPiece = pickMainPiece(piecesHere);
  const overlayPiece = pickOverlayPiece(piecesHere);

  const isAntCenter = mainPiece?.type === 'ant' && mainPiece.row === row && mainPiece.col === col;

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
      {isValidMove && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div
            className="zi-vm-dot"
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
        </div>
      )}

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

// Every prop is now either a primitive (row/col/cellSize/isSelected/
// isValidMove), a stable callback (GameBoard wraps onClick in a ref so its
// identity never changes), or a stable reference (`piecesHere` comes from a
// map memoized on `pieces`, and empty cells share the frozen NO_PIECES array;
// `bounceEffect` is undefined except during the ~0.5s after an attack). So
// React.memo's default shallow compare is exactly right: on a selection only
// the cells whose `isSelected`/`isValidMove` flipped re-render, and on a move
// only the cells whose `piecesHere` changed do. No custom comparator needed.
const BoardCell = memo(BoardCellImpl);
export default BoardCell;
