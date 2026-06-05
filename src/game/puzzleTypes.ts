import type { GamePiece, GameState, Player, Position, Orientation } from './types';
import { createInitialState } from './initialState';

// ─── Puzzle snapshot ─────────────────────────────────────────────────────
// What we store on disk. Versioned so the on-wire shape can evolve without
// invalidating proven puzzles — a snapshot loaded at a different version
// goes through a deliberate migration path, not a silent reinterpretation.
//
// The snapshot is intentionally a SUBSET of GameState: only the inputs to
// the engine (board contents + side to move). Per-turn UI state (selected
// piece, valid-move highlights, antMovedThisTurn, etc.) is reconstructed
// fresh by `puzzleSnapshotToState` so a curator-saved position never drags
// stale UI flags into a player session.

export interface PuzzleSnapshotV1 {
  v: 1;
  sideToMove: Player;
  pieces: GamePiece[];
}

export type PuzzleSnapshot = PuzzleSnapshotV1;

export const CURRENT_SNAPSHOT_VERSION = 1 as const;

// ─── Move shapes ─────────────────────────────────────────────────────────
// Both attacker and defender use the same move shape — what differs is
// just whose turn it is when the move is applied. Kept separate as
// nominal aliases so the validator tree's intent is readable at a glance.

export interface PuzzleMove {
  pieceId: string;
  target: Position;
  /** Ant only. Rotate to this orientation BEFORE moving — used when the
   *  target cell is only legally reachable from a different orientation
   *  than the ant currently has (the engine recomputes valid moves from
   *  the rotated orientation). Ignored for rotate-only moves. */
  preRotateTo?: Orientation;
  /** Ant only. AFTER moving (or in place when `target` equals current
   *  position), the ant rotates to this orientation. For rotate-only
   *  moves this is the chosen target orientation. */
  rotateTo?: Orientation;
  /** Ant rotate-only turn — no positional move, just a rotation. The
   *  engine treats this as a legal turn ending if validRotations contains
   *  `rotateTo`. */
  rotateOnly?: boolean;
}

export type AttackerMove = PuzzleMove;
export type DefenderMove = PuzzleMove;

// ─── Solution tree ───────────────────────────────────────────────────────
// AND-OR proof tree produced by the validator. The root is always an
// AttackerNode (the puzzle's first move). At each defender-to-move node
// the validator enumerates every legal reply; for the puzzle to be valid,
// each reply must lead to another forced AttackerNode or to a KillNode.

export type SolutionNode = AttackerNode | KillNode;

export interface AttackerNode {
  type: 'attacker';
  move: AttackerMove;
  /** Every legal defender reply after this attacker move, with the
   *  forced continuation per branch. The validator stores the full set
   *  so the player API can confirm forcing on demand without re-search. */
  defenderBranches: DefenderBranch[];
}

export interface DefenderBranch {
  /** The defender's move. Null only when the attacker move ended the
   *  game on the spot (kill of the lion); in that case `next` is a
   *  KillNode and there is no defender turn. */
  reply: DefenderMove | null;
  next: SolutionNode;
}

/** Terminal node — the line ends here because the attacker has killed the
 *  defending lion (either by killing the piece outright or by the
 *  attacker's lion landing on the throne). */
export interface KillNode {
  type: 'kill';
}

// ─── Hydration ───────────────────────────────────────────────────────────
// Stored snapshots are read-only blobs. Convert them into a fresh
// runtime GameState whenever the validator or the player session needs
// to interact with the engine.

/** Build a runtime GameState from a stored snapshot. The result is a
 *  brand-new GameState object — mutating it never bleeds back to the
 *  snapshot. */
export function puzzleSnapshotToState(snap: PuzzleSnapshot): GameState {
  const base = createInitialState();
  // Deep-clone pieces so the consumer can mutate freely without bleeding
  // back into the snapshot blob (engine code uses { ...p } per piece;
  // we mirror that depth here).
  const pieces: GamePiece[] = snap.pieces.map(p => ({ ...p }));
  return {
    ...base,
    pieces,
    currentPlayer: snap.sideToMove,
    selectedPieceId: null,
    validMoves: [],
    canRotate: false,
    validRotations: [],
    antHasRotated: false,
    antOriginalOrientation: undefined,
    antOriginalPosition: undefined,
    antMovedThisTurn: false,
    antAttackedThisTurn: false,
    bounceEffect: undefined,
    phase: 'playing',
    winner: null,
    turn: 0,
    lastAction: { key: 'puzzle.start' },
    history: [
      {
        pieces: pieces.map(p => ({ ...p })),
        currentPlayer: snap.sideToMove,
        lastAction: { key: 'puzzle.start' },
        turn: 0,
      },
    ],
    viewingHistoryIndex: null,
    winScreenDismissed: false,
    aiLevel: null,
    timeControl: { kind: 'none' },
    clocks: undefined,
  };
}

// ─── Loader: parse + validate the on-wire JSON shape ──────────────────────
// Defensive parse — the position blob arrives from the database (or a
// curator's pasted JSON import) and we don't trust its shape until we've
// checked it. Returns the snapshot or throws a descriptive error so the
// caller surfaces a useful message.

export function parsePuzzleSnapshot(input: unknown): PuzzleSnapshot {
  if (!input || typeof input !== 'object') {
    throw new Error('puzzle snapshot: not an object');
  }
  const raw = input as Record<string, unknown>;
  const version = raw.v;
  if (version !== 1) {
    throw new Error(`puzzle snapshot: unsupported version ${String(version)}`);
  }
  const side = raw.sideToMove;
  if (side !== 1 && side !== 2) {
    throw new Error('puzzle snapshot: sideToMove must be 1 or 2');
  }
  if (!Array.isArray(raw.pieces)) {
    throw new Error('puzzle snapshot: pieces must be an array');
  }
  // Per-piece shape check is intentionally light — the engine itself
  // tolerates extra fields and missing optional ones, and the validator
  // catches anything that produces an illegal position by failing to
  // prove the solution. We do enforce the small core that everything
  // else depends on.
  const pieces: GamePiece[] = raw.pieces.map((p, i) => coercePiece(p, i));
  return { v: 1, sideToMove: side, pieces };
}

function coercePiece(input: unknown, index: number): GamePiece {
  if (!input || typeof input !== 'object') {
    throw new Error(`piece[${index}]: not an object`);
  }
  const p = input as Record<string, unknown>;
  if (typeof p.id !== 'string' || !p.id) {
    throw new Error(`piece[${index}]: missing id`);
  }
  if (
    p.type !== 'lion' && p.type !== 'elephant' && p.type !== 'ant'
    && p.type !== 'butterfly' && p.type !== 'bat' && p.type !== 'monkey'
  ) {
    throw new Error(`piece[${index}]: invalid type ${String(p.type)}`);
  }
  if (p.player !== 1 && p.player !== 2) {
    throw new Error(`piece[${index}]: player must be 1 or 2`);
  }
  if (typeof p.row !== 'number' || typeof p.col !== 'number') {
    throw new Error(`piece[${index}]: missing row/col`);
  }
  // Defaulting hp/flags here so authors can hand-write minimal pieces in
  // the JSON import flow without remembering every optional field.
  const piece: GamePiece = {
    id: p.id,
    type: p.type,
    player: p.player,
    row: p.row,
    col: p.col,
    hp: typeof p.hp === 'number' ? p.hp : (p.type === 'elephant' ? 2 : 1),
    isDamaged: !!p.isDamaged,
    isParalyzed: !!p.isParalyzed,
    paralyzedBy: typeof p.paralyzedBy === 'string' ? p.paralyzedBy : undefined,
    shieldedBy: typeof p.shieldedBy === 'string' ? p.shieldedBy : undefined,
    shielding: typeof p.shielding === 'string' ? p.shielding : undefined,
    paralyzing: typeof p.paralyzing === 'string' ? p.paralyzing : undefined,
    orientation: p.type === 'ant'
      ? (
        p.orientation === 'horizontal' || p.orientation === 'vertical'
        || p.orientation === 'diagonal' || p.orientation === 'antidiagonal'
          ? p.orientation
          : 'horizontal'
      )
      : undefined,
    cooldown: typeof p.cooldown === 'number' ? p.cooldown : undefined,
  };
  return piece;
}

// ─── Move equality (for matching a player's submission against the tree) ──
// Two moves are equal iff they reference the same piece, target the same
// cell, and (for ants) end with the same orientation / rotate-only mode.

export function movesEqual(a: PuzzleMove, b: PuzzleMove): boolean {
  if (a.pieceId !== b.pieceId) return false;
  if (a.target.row !== b.target.row || a.target.col !== b.target.col) return false;
  if ((a.preRotateTo ?? null) !== (b.preRotateTo ?? null)) return false;
  if ((a.rotateTo ?? null) !== (b.rotateTo ?? null)) return false;
  if (!!a.rotateOnly !== !!b.rotateOnly) return false;
  return true;
}
