import { GamePiece, GameState, Player, PieceType, Orientation } from './types';

interface PlacementDef {
  type: PieceType;
  col: number;
  idx: number;
  orientation?: Orientation;
}

const PLACEMENTS: PlacementDef[] = [
  { type: 'elephant',  col: 0,  idx: 1 },
  { type: 'lion',      col: 1,  idx: 1 },
  { type: 'monkey',    col: 2,  idx: 1 },
  { type: 'bat',       col: 3,  idx: 1 },
  { type: 'ant',       col: 5,  idx: 1, orientation: 'horizontal' }, // occupies 4,5,6
  { type: 'butterfly', col: 7,  idx: 1 },
  { type: 'butterfly', col: 8,  idx: 2 },
  { type: 'ant',       col: 10, idx: 2, orientation: 'horizontal' }, // occupies 9,10,11
  { type: 'bat',       col: 12, idx: 2 },
  { type: 'monkey',    col: 13, idx: 2 },
  { type: 'lion',      col: 14, idx: 2 },
  { type: 'elephant',  col: 15, idx: 2 },
];

function makePiece(
  type: PieceType, player: Player, row: number, col: number,
  idx: number, orientation?: Orientation
): GamePiece {
  return {
    id: `${type}_p${player}_${idx}`,
    type, player, row, col,
    hp: type === 'elephant' ? 2 : 1,
    isDamaged: false,
    isParalyzed: false,
    orientation: type === 'ant' ? (orientation ?? 'horizontal') : undefined,
  };
}

function createPieces(): GamePiece[] {
  const pieces: GamePiece[] = [];
  for (const player of [1, 2] as Player[]) {
    const row = player === 1 ? 15 : 0;
    for (const p of PLACEMENTS) {
      pieces.push(makePiece(p.type, player, row, p.col, p.idx, p.orientation));
    }
  }
  return pieces;
}

export function createInitialState(): GameState {
  const pieces = createPieces();
  const startAction = { key: 'action.gameReady' };
  return {
    pieces,
    currentPlayer: 1,
    selectedPieceId: null,
    validMoves: [],
    canRotate: false,
    validRotations: [],
    antHasRotated: false,
    antOriginalOrientation: undefined,
    antOriginalPosition: undefined,
    antMovedThisTurn: false,
    bounceEffect: undefined,
    phase: 'menu',
    winner: null,
    turn: 0,
    lastAction: startAction,
    history: [
      // history[0] is always the starting position. Cloning the pieces array
      // is essential so that subsequent live-state mutations don't bleed back
      // into the snapshot.
      {
        pieces: pieces.map(p => ({ ...p })),
        currentPlayer: 1,
        lastAction: startAction,
        turn: 0,
      },
    ],
    viewingHistoryIndex: null,
    winScreenDismissed: false,
  };
}
