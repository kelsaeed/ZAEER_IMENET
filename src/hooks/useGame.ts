'use client';
import { useState, useCallback, useEffect } from 'react';
import { GameState, Orientation } from '@/game/types';
import { createInitialState } from '@/game/initialState';
import { getValidMoves, applyMove, applyEndTurn, getAntCells, getInteractiveAtCell } from '@/game/logic';
import { isInBounds, isBarrier } from '@/game/constants';

// Bumped to v3 with the history / review feature: GameState now contains a
// history array, viewingHistoryIndex, and winScreenDismissed. Older saved
// games are dropped instead of partially loaded (would crash the review UI).
const STORAGE_KEY = 'zaeer-imenet-state-v3';

function getStoredState(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.phase !== 'playing' && parsed.phase !== 'won') return null;
    if (!Array.isArray(parsed.pieces) || !Number.isFinite(parsed.currentPlayer)) return null;
    if (!parsed.lastAction || typeof parsed.lastAction !== 'object' || typeof (parsed.lastAction as { key?: string }).key !== 'string') return null;
    if (!Array.isArray(parsed.history)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useGame() {
  // Always start with initial state to avoid hydration mismatch
  const [state, setState] = useState<GameState>(() => createInitialState());
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from sessionStorage after mount (client-side only)
  useEffect(() => {
    const stored = getStoredState();
    if (stored) {
      setState(stored);
    }
    setIsHydrated(true);
  }, []);

  // Persist state so the game survives remounts (e.g. React Strict Mode, HMR)
  useEffect(() => {
    if (!isHydrated) return; // Don't persist until after hydration
    if (state.phase !== 'menu') {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [state, isHydrated]);

  // Clear bounce effect after animation completes
  useEffect(() => {
    if (state.bounceEffect) {
      const t = setTimeout(() => {
        setState(prev => ({ ...prev, bounceEffect: undefined }));
      }, 550);
      return () => clearTimeout(t);
    }
  }, [state.bounceEffect?.pieceId, state.turn]);

  const startGame = useCallback(() => {
    setState({ ...createInitialState(), phase: 'playing', lastAction: { key: 'action.player1Turn' } });
  }, []);

  /** Go all the way back to the start screen (with the rules / piece guide). */
  const resetGame = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setState(createInitialState());
  }, []);

  /** Restart the match in place — fresh pieces, no phase change. The player
   *  stays on the board instead of returning to the menu. */
  const restartMatch = useCallback(() => {
    setState({ ...createInitialState(), phase: 'playing', lastAction: { key: 'action.player1Turn' } });
  }, []);

  // ─── History review ─────────────────────────────────────────────────────
  // While viewingHistoryIndex !== null the board renders a frozen snapshot
  // and clicks are ignored. The "live" state is unaffected; pressing Live
  // returns to interactive play.

  /** Step backward one snapshot. From the live state, jumps to the previous
   *  turn (so you immediately see the change you'd undo). */
  const historyBack = useCallback(() => {
    setState(prev => {
      if (prev.history.length === 0) return prev;
      const cur = prev.viewingHistoryIndex;
      // history[length - 1] equals the live state, so "back from live"
      // jumps to length - 2 — the position one move ago.
      const next = cur === null ? prev.history.length - 2 : cur - 1;
      return { ...prev, viewingHistoryIndex: Math.max(0, next), selectedPieceId: null, validMoves: [] };
    });
  }, []);

  /** Step forward one snapshot. Stepping past the end returns to live mode. */
  const historyForward = useCallback(() => {
    setState(prev => {
      if (prev.viewingHistoryIndex === null) return prev;
      const next = prev.viewingHistoryIndex + 1;
      if (next >= prev.history.length - 1) {
        return { ...prev, viewingHistoryIndex: null };
      }
      return { ...prev, viewingHistoryIndex: next };
    });
  }, []);

  /** Jump straight back to the live state. */
  const historyToLive = useCallback(() => {
    setState(prev => (prev.viewingHistoryIndex === null ? prev : { ...prev, viewingHistoryIndex: null }));
  }, []);

  /** Jump to a specific snapshot index (used by the slider). */
  const historyJumpTo = useCallback((index: number) => {
    setState(prev => {
      if (index < 0 || index >= prev.history.length) return prev;
      // Top of the slider == live.
      if (index === prev.history.length - 1) return { ...prev, viewingHistoryIndex: null };
      return { ...prev, viewingHistoryIndex: index, selectedPieceId: null, validMoves: [] };
    });
  }, []);

  /** Hide the victory modal so the user can browse the board / history. */
  const dismissWinScreen = useCallback(() => {
    setState(prev => ({ ...prev, winScreenDismissed: true }));
  }, []);

  /** Re-open the victory modal from the floating pill. */
  const showWinScreen = useCallback(() => {
    setState(prev => ({ ...prev, winScreenDismissed: false }));
  }, []);

  /** Rotate the currently selected ant to the given orientation. Only valid options are allowed.
   * If ant hasn't moved yet, rotation-only ends the turn automatically (Option 1).
   * If ant has moved, rotation is allowed but turn must be ended manually (Option 2). */
  const rotateAntTo = useCallback((targetOrientation: Orientation) => {
    setState(prev => {
      if (!prev.selectedPieceId || prev.phase !== 'playing') return prev;
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
    });
  }, []);

  /** End turn (ant: after any action - rotate-only, move-only, or move+rotate; must be ant selected). */
  const endTurn = useCallback(() => {
    setState(prev => {
      if (!prev.selectedPieceId || prev.phase !== 'playing') return prev;
      const piece = prev.pieces.find(p => p.id === prev.selectedPieceId);
      if (!piece || piece.type !== 'ant') return prev;
      // Can end turn if: rotated, moved, or both
      if (!prev.antMovedThisTurn && !prev.antHasRotated) return prev;
      return applyEndTurn(prev);
    });
  }, []);

  /** When butterfly is selected and shielding a piece, switch selection to the shielded piece to move both. */
  const switchToShieldedPiece = useCallback(() => {
    setState(prev => {
      if (!prev.selectedPieceId || prev.phase !== 'playing') return prev;
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
    });
  }, []);

  /** Inverse: when a shielded piece is selected, switch to its butterfly so the butterfly moves alone. */
  const switchToShieldingButterfly = useCallback(() => {
    setState(prev => {
      if (!prev.selectedPieceId || prev.phase !== 'playing') return prev;
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
    });
  }, []);

  /** Handle a cell click: select piece or execute move. */
  const clickCell = useCallback((row: number, col: number) => {
    setState(prev => {
      if (prev.phase !== 'playing') return prev;
      // Read-only mode while reviewing history.
      if (prev.viewingHistoryIndex !== null) return prev;

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

      // If ant has moved and user clicks an empty / non-mine cell, snap the
      // ant back to its original square and deselect. The move slot stays
      // CONSUMED for this turn (antMovedThisTurn remains true) — rotation
      // and End Turn are the only remaining options. The lock above already
      // returns when the click would switch to a different own-piece, so
      // the !myPiece path is the only one that reaches here.
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
          // antMovedThisTurn intentionally NOT reset — one move per turn.
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
    });
  }, []);

  return {
    state,
    startGame,
    resetGame,
    restartMatch,
    rotateAntTo,
    endTurn,
    switchToShieldedPiece,
    switchToShieldingButterfly,
    clickCell,
    // History review
    historyBack,
    historyForward,
    historyToLive,
    historyJumpTo,
    // Win modal
    dismissWinScreen,
    showWinScreen,
  };
}
