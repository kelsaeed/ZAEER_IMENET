// Pure board-layout helpers shared by GameBoard (to build per-cell props once
// per render) and BoardCell (to derive its main/overlay piece from the cell's
// piece list). Extracting these keeps the per-cell derivation identical on
// both sides — GameBoard computes `isSelected` from the SAME main-piece pick
// BoardCell renders — and makes the logic unit-testable without React.
//
// Why this exists: selecting a piece used to hand every one of the 256
// BoardCells a fresh `validMoves` array and a changed `selectedPieceId`, so
// all 256 re-rendered. By turning those into a memoized cell→pieces map plus
// per-cell booleans, only the cells that actually change re-render.

import type { GamePiece, Position } from './types';
import { getAntCells } from './logic';

/** Shared stable empty list for cells with no pieces. Reusing one frozen
 *  reference means every empty cell receives the SAME `piecesHere` prop, so
 *  React.memo treats them as unchanged across an unrelated state update.
 *  Never mutated — the builder only ever pushes into freshly-created arrays. */
export const NO_PIECES: readonly GamePiece[] = Object.freeze([]);

export function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

/** Map every board cell to the pieces occupying it, in `pieces` order.
 *  Mirrors `getPiecesAtCell` exactly: a non-ant occupies its own square; an
 *  ant occupies all three of its body cells (centre + wings). Built once per
 *  `pieces` change instead of filtering all pieces inside all 256 cells. */
export function buildCellPieceMap(pieces: GamePiece[]): Map<string, GamePiece[]> {
  const map = new Map<string, GamePiece[]>();
  const add = (r: number, c: number, p: GamePiece) => {
    const k = cellKey(r, c);
    const arr = map.get(k);
    if (arr) arr.push(p);
    else map.set(k, [p]);
  };
  for (const p of pieces) {
    if (p.type === 'ant') {
      for (const cell of getAntCells(p.row, p.col, p.orientation!)) add(cell.row, cell.col, p);
    } else {
      add(p.row, p.col, p);
    }
  }
  return map;
}

/** The piece that "owns" a cell visually: the non-overlay piece if present,
 *  else the first piece. Matches BoardCell's original main-piece selection. */
export function pickMainPiece(piecesHere: readonly GamePiece[]): GamePiece | undefined {
  if (piecesHere.length === 0) return undefined;
  return piecesHere.find(p => !p.shielding && !p.paralyzing) ?? piecesHere[0];
}

/** The overlay piece at a cell (a butterfly shielding or a bat paralyzing). */
export function pickOverlayPiece(piecesHere: readonly GamePiece[]): GamePiece | undefined {
  return piecesHere.find(p => p.shielding !== undefined || p.paralyzing !== undefined);
}

/** Set of "row,col" keys that are legal targets — O(1) per-cell lookup
 *  instead of scanning the validMoves array in every cell. */
export function buildValidMoveSet(validMoves: Position[]): Set<string> {
  const set = new Set<string>();
  for (const m of validMoves) set.add(cellKey(m.row, m.col));
  return set;
}
