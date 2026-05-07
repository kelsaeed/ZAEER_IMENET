export type PieceType = 'lion' | 'elephant' | 'ant' | 'butterfly' | 'bat' | 'monkey';
export type Player = 1 | 2;
export type Orientation = 'horizontal' | 'vertical' | 'diagonal' | 'antidiagonal';

/** Chess-style time control attached to a game. `none` is the default and
 *  preserves the original "no clock" experience. `clock` is the standard
 *  chess pattern: each player gets `matchSeconds`; their clock counts
 *  down only while it's their turn; finishing a move adds `increment`
 *  seconds back to the player who moved (Fischer); `perMoveSeconds` is
 *  a separate hard cap on a single move (0 disables it). */
export type TimeControl =
  | { kind: 'none' }
  | { kind: 'clock'; matchSeconds: number; increment: number; perMoveSeconds: number };

/** Live remaining time, mirrored on every state update. The clock that
 *  is *actively counting* is whichever player matches `currentPlayer`;
 *  the other clock holds its value until the turn flips back. */
export interface Clocks {
  /** Match-clock seconds remaining for player 1. */
  p1Seconds: number;
  /** Match-clock seconds remaining for player 2. */
  p2Seconds: number;
  /** Per-move seconds remaining for the active player; resets at every
   *  turn flip. 0 if perMoveSeconds was 0 (i.e. no per-move limit). */
  perMoveSeconds: number;
  /** Wall-clock instant the active player's clock started ticking, in
   *  ISO. Clients compute display time as `activeSeconds - (now - this)`.
   *  Persisted with the game state so reconciliation across reload /
   *  Realtime echo is straightforward. */
  startedAt: string;
}

/** Compact-friendly preset used by the lobby modals. Resolves to a
 *  full TimeControl when the player launches a game. */
export interface TimeControlPreset {
  id: string;
  /** Localisation key for the preset label, e.g. 'preset.rapid'. */
  labelKey: string;
  matchSeconds: number;
  increment: number;
}

/** Local single-player AI difficulty levels.
 *  - 'butterfly' = easy (random legal move)
 *  - 'monkey'    = medium (1-ply greedy heuristic)
 *  - 'lion'      = hard   (2-ply minimax)
 *  null = no AI (regular pass-and-play). */
export type AiLevel = 'butterfly' | 'monkey' | 'lion';

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

/** A frozen snapshot of the board after one action. Stored on every state
 *  change so the user can step backward through the game (and forward
 *  again) without ever mutating the live state. */
export interface HistorySnapshot {
  pieces: GamePiece[];
  currentPlayer: Player;
  lastAction: ActionMessage;
  turn: number;
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
  /** True when the ant's move this turn killed or damaged an enemy.
   *  Once set, the move is irreversible: the player cannot snap the ant
   *  back, switch pieces, or click anywhere on the board — only rotate
   *  the ant (optional) or End Turn. Cleared on End Turn. */
  antAttackedThisTurn: boolean;
  // Bounce animation: set when an attack partially succeeds (target survives)
  bounceEffect?: BounceEffect;
  phase: 'menu' | 'playing' | 'won';
  winner: Player | null;
  turn: number;
  lastAction: ActionMessage;
  /** Snapshots after every state change. history[0] is the starting position. */
  history: HistorySnapshot[];
  /** null = viewing the live state. Otherwise an index into `history` we are
   *  reviewing — UI is read-only while this is non-null. */
  viewingHistoryIndex: number | null;
  /** Win modal state: true = the user has dismissed it; a small floating
   *  pill remains so they can pop it back open at any time. */
  winScreenDismissed: boolean;
  /** When set, player 2 is controlled by the local AI at this difficulty.
   *  null/undefined = regular pass-and-play. The online game leaves this
   *  unset — both sides are humans on different devices. */
  aiLevel?: AiLevel | null;
  /** Time control for this match. Optional/undefined = legacy untimed.
   *  Mirrors `games.time_control` on online games. */
  timeControl?: TimeControl;
  /** Live clock readout — present only when timeControl.kind === 'clock'.
   *  Updated on every turn flip; the active player's display ticks down
   *  via a setInterval in the HUD without needing a state write. */
  clocks?: Clocks;
}
