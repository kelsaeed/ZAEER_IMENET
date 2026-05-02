'use client';
import { useState, useCallback, useEffect } from 'react';
import { GameState, Orientation } from '@/game/types';
import { createInitialState } from '@/game/initialState';
import { getValidMoves, applyMove, applyEndTurn, getAntCells, getInteractiveAtCell } from '@/game/logic';
import { isInBounds, isBarrier } from '@/game/constants';

// Bumped to v2: the lastAction shape changed from string to ActionMessage,
// the elephantAttackedThisTurn state field was removed, and elephant
// cooldown is now per-piece. Older saved games are dropped.
const STORAGE_KEY = 'zaeer-imenet-state-v2';

function getStoredState(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.phase !== 'playing' && parsed.phase !== 'won') return null;
    if (!Array.isArray(parsed.pieces) || !Number.isFinite(parsed.currentPlayer)) return null;
    if (!parsed.lastAction || typeof parsed.lastAction !== 'object' || typeof (parsed.lastAction as { key?: string }).key !== 'string') return null;
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

  const resetGame = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setState(createInitialState());
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

      // If ant has moved and user clicks elsewhere or another piece, revert ant to original position
      // But keep rotations - only revert position if ant moved
      if (selectedPiece?.type === 'ant' && prev.antMovedThisTurn) {
        if (!myPiece || myPiece.id !== prev.selectedPieceId) {
          // Revert ant to original position (but keep current orientation if rotated)
          let pieces = prev.pieces.map(p => {
            if (p.id === prev.selectedPieceId) {
              const reverted = { ...p };
              if (prev.antOriginalPosition) {
                reverted.row = prev.antOriginalPosition.row;
                reverted.col = prev.antOriginalPosition.col;
              }
              // Keep current orientation (don't revert rotation)
              return reverted;
            }
            return p;
          });
          
          // If clicking on another piece, select it; otherwise deselect
          if (myPiece) {
            const freshPiece = pieces.find(p => p.id === myPiece.id)!;
            const { moves, canRotate, validRotations } = getValidMoves(freshPiece, pieces);
            return {
              ...prev,
              pieces,
              selectedPieceId: myPiece.id,
              validMoves: moves,
              canRotate,
              validRotations,
              antHasRotated: false,
              antOriginalOrientation: freshPiece.type === 'ant' ? freshPiece.orientation : undefined,
              antOriginalPosition: freshPiece.type === 'ant' ? { row: freshPiece.row, col: freshPiece.col } : undefined,
              antMovedThisTurn: false,
            };
          } else {
            // Deselect: revert to original position AND original orientation
            // Also revert butterfly if piece is shielded (butterfly was at same position as shielded piece)
            const selectedPiece = pieces.find(p => p.id === prev.selectedPieceId);
            const butterfly = selectedPiece?.shieldedBy ? pieces.find(p => p.id === selectedPiece.shieldedBy) : null;
            
            const revertedPieces = pieces.map(p => {
              if (p.id === prev.selectedPieceId) {
                const reverted = { ...p };
                // Revert position if moved
                if (prev.antOriginalPosition) {
                  reverted.row = prev.antOriginalPosition.row;
                  reverted.col = prev.antOriginalPosition.col;
                }
                // Revert orientation if rotated
                if (prev.antOriginalOrientation) {
                  reverted.orientation = prev.antOriginalOrientation;
                }
                return reverted;
              }
              // Also revert butterfly to original position (same as shielded piece's original position)
              if (butterfly && p.id === butterfly.id && prev.antOriginalPosition) {
                // Butterfly should return to where the shielded piece originally was (they were on same cell)
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
              antOriginalOrientation: undefined,
              antOriginalPosition: undefined,
              antMovedThisTurn: false,
            };
          }
        }
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

      return {
        ...prev,
        pieces,
        selectedPieceId: myPiece.id,
        validMoves: moves,
        canRotate,
        validRotations,
        antHasRotated: false,
        antOriginalOrientation: freshPiece.type === 'ant' ? freshPiece.orientation : undefined,
        antOriginalPosition: freshPiece.type === 'ant' ? { row: freshPiece.row, col: freshPiece.col } : undefined,
      };
    });
  }, []);

  return { state, startGame, resetGame, rotateAntTo, endTurn, switchToShieldedPiece, switchToShieldingButterfly, clickCell };
}
