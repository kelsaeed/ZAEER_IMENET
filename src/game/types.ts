export type PieceType = 'lion' | 'elephant' | 'ant' | 'butterfly' | 'bat' | 'monkey';
export type Player = 1 | 2;
export type Orientation = 'horizontal' | 'vertical' | 'diagonal' | 'antidiagonal';

export interface Position {
  row: number;
  col: number;
}

export interface GamePiece {
  id: string;
  type: PieceType;
  player: Player;
  row: number;
  col: number;
  hp: number;
  isDamaged: boolean;
  isParalyzed: boolean;
  paralyzedBy?: string;
  shieldedBy?: string;
  shielding?: string;    // butterfly: id of piece being shielded
  paralyzing?: string;   // bat: id of piece being paralyzed
  orientation?: Orientation;
  /** Elephant attack cooldown. After attacking, set to 2.
   *  Decrements at the end of each of this piece's owner's turns.
   *  While > 0, the elephant can move but cannot attack. */
  cooldown?: number;
}

export interface BounceEffect {
  pieceId: string;
  dr: number; // normalized direction toward the target
  dc: number;
}

/** A translatable action message. The HUD renders this via t(key) + format(vars).
 *  By convention, vars whose key ends in "Name" carry a PieceType string (e.g. "elephant")
 *  and the renderer translates them as t(`piece.${type}`) before substitution. */
export interface ActionMessage {
  key: string;
  vars?: Record<string, string | number>;
}

export interface GameState {
  pieces: GamePiece[];
  currentPlayer: Player;
  selectedPieceId: string | null;
  validMoves: Position[];
  canRotate: boolean;
  /** For ant: orientations the ant can rotate into (only valid options shown). */
  validRotations: Orientation[];
  // Ant rotation state — rotation is free when combined with a move.
  // If player rotates and does NOT move, clicking "End Turn" costs the turn.
  antHasRotated: boolean;
  antOriginalOrientation?: Orientation;
  antOriginalPosition?: Position; // Track original position to revert if needed
  // Ant can move then rotate; turn ends only when player clicks End Turn
  antMovedThisTurn: boolean;
  // Bounce animation: set when an attack partially succeeds (target survives)
  bounceEffect?: BounceEffect;
  phase: 'menu' | 'playing' | 'won';
  winner: Player | null;
  turn: number;
  lastAction: ActionMessage;
}
