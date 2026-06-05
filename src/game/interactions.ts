// Pure UI-interaction reducers.
//
// These are the state transitions that used to live inline inside useGame's
// setState callbacks (clickCell, rotateAntTo, endTurn, and the two
// shield-switch helpers). They are plain `(state, …) => state` functions with
// no React in sight, so the tricky selection / ant-revert rules can finally
// be unit-tested directly instead of only through the UI.
//
// Behaviour is intentionally identical to the previous inline versions — this
// is a code move, not a rule change. The engine itself (applyMove /
// applyEndTurn / getValidMoves) is untouched.

import { GameState, Orientation } from './types';
import { getValidMoves, applyMove, applyEndTurn } from './logic';

/** The state to RENDER for a given history-review index. When not reviewing
 *  (index null) this is the live state, unchanged. While reviewing, it overlays
 *  the chosen snapshot's pieces/turn/action and blanks the live selection so
 *  review highlights don't bleed in. Pure — never mutates `state`.
 *
 *  Shared by the home and online boards, which both derived this identically. */
export function historyReviewState(state: GameState, viewingHistoryIndex: number | null): GameState {
  if (viewingHistoryIndex === null) return state;
  const snap = state.history[viewingHistoryIndex];
  return {
    ...state,
    pieces: snap.pieces,
    currentPlayer: snap.currentPlayer,
    lastAction: snap.lastAction,
    turn: snap.turn,
    selectedPieceId: null,
    validMoves: [],
    canRotate: false,
    validRotations: [],
    bounceEffect: undefined,
  };
}

/** Rotate the currently selected ant to the given orientation. Only valid
 *  options are allowed. If the ant hasn't moved yet, the new orientation's
 *  moves are shown; once it has moved, movement is hidden (rotate / End Turn
 *  only). vs-AI: rotations are refused on the AI's turn. */
export function reduceRotateAntTo(prev: GameState, targetOrientation: Orientation): GameState {
  if (!prev.selectedPieceId || prev.phase !== 'playing') return prev;
  // vs-AI: refuse rotations on the AI's turn so the user can't drive
  // the bot's pieces around.
  if (prev.aiLevel && prev.currentPlayer === 2) return prev;
  const piece = prev.pieces.find(p => p.id === prev.selectedPieceId);
  if (!piece || piece.type !== 'ant') return prev;
  if (!prev.validRotations.includes(targetOrientation)) return prev;

  const newPieces = prev.pieces.map(p =>
    p.id === prev.selectedPieceId ? { ...p, orientation: targetOrientation } : p
  );
  const updatedPiece = { ...piece, orientation: targetOrientation };
  const { moves, canRotate, validRotations } = getValidMoves(updatedPiece, newPieces);

  // Once the ant has moved this turn, no more movement; otherwise show the
  // valid moves for the NEW orientation so the player sees the right cells.
  return {
    ...prev,
    pieces: newPieces,
    validMoves: prev.antMovedThisTurn ? [] : moves,
    canRotate,
    validRotations,
    antHasRotated: true,
    antOriginalOrientation: prev.antOriginalOrientation ?? piece.orientation,
    antOriginalPosition: prev.antOriginalPosition,
  };
}

/** End turn (ant: after any action - rotate-only, move-only, or move+rotate;
 *  must be ant selected). */
export function reduceEndTurn(prev: GameState): GameState {
  if (!prev.selectedPieceId || prev.phase !== 'playing') return prev;
  // vs-AI: only the human (player 1) can press End Turn.
  if (prev.aiLevel && prev.currentPlayer === 2) return prev;
  const piece = prev.pieces.find(p => p.id === prev.selectedPieceId);
  if (!piece || piece.type !== 'ant') return prev;
  // Can end turn if: rotated, moved, or both
  if (!prev.antMovedThisTurn && !prev.antHasRotated) return prev;
  return applyEndTurn(prev);
}

/** When butterfly is selected and shielding a piece, switch selection to the
 *  shielded piece to move both. */
export function reduceSwitchToShieldedPiece(prev: GameState): GameState {
  if (!prev.selectedPieceId || prev.phase !== 'playing') return prev;
  if (prev.aiLevel && prev.currentPlayer === 2) return prev;
  const piece = prev.pieces.find(p => p.id === prev.selectedPieceId);
  if (!piece || piece.type !== 'butterfly' || !piece.shielding) return prev;
  const shieldedId = piece.shielding;
  const shielded = prev.pieces.find(p => p.id === shieldedId);
  if (!shielded) return prev;
  const { moves, canRotate, validRotations } = getValidMoves(shielded, prev.pieces);
  return {
    ...prev,
    selectedPieceId: shieldedId,
    validMoves: moves,
    canRotate,
    validRotations: validRotations ?? [],
    antOriginalOrientation: shielded.type === 'ant' ? shielded.orientation : undefined,
    antOriginalPosition: shielded.type === 'ant' ? { row: shielded.row, col: shielded.col } : undefined,
  };
}

/** Inverse: when a shielded piece is selected, switch to its butterfly so the
 *  butterfly moves alone. */
export function reduceSwitchToShieldingButterfly(prev: GameState): GameState {
  if (!prev.selectedPieceId || prev.phase !== 'playing') return prev;
  if (prev.aiLevel && prev.currentPlayer === 2) return prev;
  const shielded = prev.pieces.find(p => p.id === prev.selectedPieceId);
  if (!shielded || !shielded.shieldedBy) return prev;
  const butterfly = prev.pieces.find(p => p.id === shielded.shieldedBy);
  if (!butterfly) return prev;
  const { moves, canRotate, validRotations } = getValidMoves(butterfly, prev.pieces);
  return {
    ...prev,
    selectedPieceId: butterfly.id,
    validMoves: moves,
    canRotate,
    validRotations: validRotations ?? [],
    antOriginalOrientation: undefined,
    antOriginalPosition: undefined,
  };
}

/** Handle a cell click: select a piece or execute a move. Encapsulates the
 *  ant attack-lock, the "changed my mind" ant revert, pending-rotation undo
 *  on deselect, and the shielded-stack selection preference. */
export function reduceCellClick(prev: GameState, row: number, col: number): GameState {
  if (prev.phase !== 'playing') return prev;
  // Read-only mode while reviewing history.
  if (prev.viewingHistoryIndex !== null) return prev;
  // vs-AI: ignore board taps while the bot is thinking. Without this
  // guard, the user could click a player-2 piece and drive the AI's
  // own units (since selection just gates on currentPlayer).
  if (prev.aiLevel && prev.currentPlayer === 2) return prev;

  // Ant attack lock: once the ant killed/damaged an enemy, the only
  // legal follow-ups are HUD-driven (rotateAntTo / endTurn). Refuse
  // every cell click so the player can't snap back to undo the kill,
  // can't move the ant elsewhere, and can't switch to another piece.
  if (prev.antAttackedThisTurn) return prev;

  // If a piece is selected, check for valid move first
  if (prev.selectedPieceId) {
    const isValidMove = prev.validMoves.some(m => m.row === row && m.col === col);
    if (isValidMove) {
      return applyMove(prev, prev.selectedPieceId, row, col);
    }
  }

  // Try to select a piece at the clicked cell.
  // Prefer the shielded piece (the protected one) over the butterfly overlay,
  // so clicking a stack defaults to "move the shielded piece (with butterfly)".
  // The HUD then offers a button to switch to "move butterfly alone".
  const atCell = prev.pieces.filter(p => p.row === row && p.col === col && p.player === prev.currentPlayer);
  const myPiece = atCell.length > 0
    ? (atCell.find(p => p.shieldedBy) ?? atCell.find(p => !p.shielding) ?? atCell[0])
    : null;

  // If an ant is selected and has moved/rotated, prevent selecting other pieces (ant turn locked)
  // But allow deselecting the ant or selecting other pieces if ant hasn't acted yet
  const selectedPiece = prev.selectedPieceId ? prev.pieces.find(p => p.id === prev.selectedPieceId) : null;
  if (selectedPiece?.type === 'ant' && (prev.antMovedThisTurn || prev.antHasRotated)) {
    // Ant has already acted - can only deselect or continue with ant actions
    // Don't allow selecting other pieces when ant turn is in progress
    if (myPiece && myPiece.id !== prev.selectedPieceId) {
      return prev;
    }
  }

  // If clicking on a shielded piece, select it (default: move with butterfly)
  // User can still select butterfly alone if they want

  // Ant moved (without attacking) and user clicked an empty / non-mine
  // cell → "I changed my mind". Snap the ant fully back to its origin
  // AND clear antMovedThisTurn so the player can move it again (or pick
  // another piece). antAttackedThisTurn would have short-circuited at
  // the top of clickCell, so reaching here guarantees the move was just
  // a positional change with no irreversible combat.
  if (selectedPiece?.type === 'ant' && prev.antMovedThisTurn && !myPiece) {
    const sel = prev.pieces.find(p => p.id === prev.selectedPieceId);
    const butterfly = sel?.shieldedBy ? prev.pieces.find(p => p.id === sel.shieldedBy) : null;
    const revertedPieces = prev.pieces.map(p => {
      if (p.id === prev.selectedPieceId) {
        const reverted = { ...p };
        if (prev.antOriginalPosition) {
          reverted.row = prev.antOriginalPosition.row;
          reverted.col = prev.antOriginalPosition.col;
        }
        if (prev.antOriginalOrientation) {
          reverted.orientation = prev.antOriginalOrientation;
        }
        return reverted;
      }
      if (butterfly && p.id === butterfly.id && prev.antOriginalPosition) {
        return {
          ...p,
          row: prev.antOriginalPosition.row,
          col: prev.antOriginalPosition.col,
        };
      }
      return p;
    });
    return {
      ...prev,
      pieces: revertedPieces,
      selectedPieceId: null,
      validMoves: [],
      canRotate: false,
      validRotations: [],
      antHasRotated: false,
      antMovedThisTurn: false,
      antOriginalOrientation: undefined,
      antOriginalPosition: undefined,
    };
  }

  // If deselecting or switching pieces — undo pending rotation
  let pieces = prev.pieces;
  if (prev.selectedPieceId && prev.antHasRotated && prev.antOriginalOrientation) {
    pieces = prev.pieces.map(p =>
      p.id === prev.selectedPieceId
        ? { ...p, orientation: prev.antOriginalOrientation }
        : p
    );
  }

  if (!myPiece) {
    return {
      ...prev,
      pieces,
      selectedPieceId: null,
      validMoves: [],
      canRotate: false,
      validRotations: [],
      antHasRotated: false,
      antOriginalOrientation: undefined,
      antOriginalPosition: undefined,
    };
  }

  // Select the piece (default = shielded piece if stack; HUD lets user switch to butterfly alone)
  const freshPiece = pieces.find(p => p.id === myPiece.id)!;
  const { moves, canRotate, validRotations } = getValidMoves(freshPiece, pieces);
  const isAnt = freshPiece.type === 'ant';
  const sameSelection = myPiece.id === prev.selectedPieceId;

  return {
    ...prev,
    pieces,
    selectedPieceId: myPiece.id,
    // Once the ant has used its move this turn, hide further move
    // options on re-selection so it can only rotate / End Turn.
    validMoves: (isAnt && prev.antMovedThisTurn) ? [] : moves,
    canRotate,
    validRotations,
    // Preserve the turn-scoped flags when re-selecting the SAME piece;
    // a fresh selection starts the per-turn tracking from the current cell.
    antHasRotated: sameSelection ? prev.antHasRotated : false,
    antOriginalOrientation: sameSelection
      ? prev.antOriginalOrientation
      : (isAnt ? freshPiece.orientation : undefined),
    antOriginalPosition: sameSelection
      ? prev.antOriginalPosition
      : (isAnt ? { row: freshPiece.row, col: freshPiece.col } : undefined),
  };
}
