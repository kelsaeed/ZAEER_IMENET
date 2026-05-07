import type { GameState, GamePiece, Player, Position, Orientation } from './types';

/** A single board lesson. Each step ships with a preset list of pieces
 *  (sparse — just what the lesson needs), the cell the player should
 *  click first to select, and the destination cell. The tutorial page
 *  blocks every other click so a confused first-timer can't wander off. */
export interface TutorialStep {
  id: string;
  /** Locale keys for the title + body line shown above the board. */
  titleKey: string;
  bodyKey: string;
  /** "Done!" message shown after the lesson move lands. */
  doneKey: string;
  /** Sparse piece set placed on the standard 16×16 board. */
  pieces: GamePiece[];
  /** The cell holding the piece the player should pick up. */
  selectFrom: Position;
  /** Cell the player should move that piece to. */
  moveTo: Position;
  /** True once the player has performed the lesson move (post-applyMove
   *  state). Cheap predicate over the resulting GameState. */
  isComplete: (state: GameState) => boolean;
}

// ─── Helpers to build pieces ────────────────────────────────────────────

function piece(opts: {
  type: GamePiece['type'];
  player: Player;
  row: number;
  col: number;
  id?: string;
  hp?: number;
  orientation?: Orientation;
  isParalyzed?: boolean;
  paralyzedBy?: string;
  paralyzing?: string;
  shielding?: string;
  shieldedBy?: string;
}): GamePiece {
  return {
    id: opts.id ?? `${opts.type}_p${opts.player}_t`,
    type: opts.type,
    player: opts.player,
    row: opts.row,
    col: opts.col,
    hp: opts.hp ?? (opts.type === 'elephant' ? 2 : 1),
    isDamaged: false,
    isParalyzed: opts.isParalyzed ?? false,
    paralyzedBy: opts.paralyzedBy,
    paralyzing: opts.paralyzing,
    shielding: opts.shielding,
    shieldedBy: opts.shieldedBy,
    orientation: opts.orientation,
  };
}

/** Wrap a sparse piece array into a fully-formed GameState that matches
 *  what `useGame` expects. Tutorial steps don't care about history /
 *  rematch / clocks etc — those just get safe defaults. */
export function tutorialState(pieces: GamePiece[], currentPlayer: Player = 1): GameState {
  return {
    pieces,
    currentPlayer,
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
    lastAction: { key: 'action.gameReady' },
    history: [
      {
        pieces: pieces.map(p => ({ ...p })),
        currentPlayer,
        lastAction: { key: 'action.gameReady' },
        turn: 0,
      },
    ],
    viewingHistoryIndex: null,
    winScreenDismissed: false,
    aiLevel: null,
    timeControl: { kind: 'none' },
  };
}

// ─── Step definitions ───────────────────────────────────────────────────
// All board coordinates are zero-indexed (row 0 = top, row 15 = bottom)
// to match the rest of the code. Player-1 pieces start near the bottom.

/** Lesson 1: just move a Lion one step up. The simplest possible lesson;
 *  teaches the click-piece-then-click-destination pattern. */
const STEP_MOVE: TutorialStep = {
  id: 'move',
  titleKey: 'tutorial.move.title',
  bodyKey: 'tutorial.move.body',
  doneKey: 'tutorial.move.done',
  pieces: [
    piece({ type: 'lion', player: 1, row: 15, col: 7, id: 'lion_p1_tut' }),
  ],
  selectFrom: { row: 15, col: 7 },
  moveTo: { row: 14, col: 7 },
  isComplete: (s) => {
    const l = s.pieces.find(p => p.id === 'lion_p1_tut');
    return !!l && l.row === 14 && l.col === 7;
  },
};

/** Lesson 2: stack the Butterfly diagonally onto your Lion to shield
 *  it. Teaches the unique "shield by stacking" mechanic. */
const STEP_SHIELD: TutorialStep = {
  id: 'shield',
  titleKey: 'tutorial.shield.title',
  bodyKey: 'tutorial.shield.body',
  doneKey: 'tutorial.shield.done',
  pieces: [
    piece({ type: 'lion',      player: 1, row: 15, col: 8, id: 'lion_p1_tut' }),
    piece({ type: 'butterfly', player: 1, row: 14, col: 7, id: 'butterfly_p1_tut' }),
  ],
  selectFrom: { row: 14, col: 7 },
  moveTo:     { row: 15, col: 8 },
  isComplete: (s) => {
    const b = s.pieces.find(p => p.id === 'butterfly_p1_tut');
    return !!b && b.row === 15 && b.col === 8 && b.shielding === 'lion_p1_tut';
  },
};

/** Lesson 3: slide the Bat diagonally onto an enemy Monkey to paralyze
 *  it. Teaches the bat's offensive disable. */
const STEP_PARALYZE: TutorialStep = {
  id: 'paralyze',
  titleKey: 'tutorial.paralyze.title',
  bodyKey: 'tutorial.paralyze.body',
  doneKey: 'tutorial.paralyze.done',
  pieces: [
    piece({ type: 'bat',    player: 1, row: 14, col: 7, id: 'bat_p1_tut' }),
    piece({ type: 'monkey', player: 2, row: 15, col: 8, id: 'monkey_p2_tut' }),
  ],
  selectFrom: { row: 14, col: 7 },
  moveTo:     { row: 15, col: 8 },
  isComplete: (s) => {
    const m = s.pieces.find(p => p.id === 'monkey_p2_tut');
    return !!m && m.isParalyzed === true;
  },
};

/** Lesson 4: rescue your paralyzed Lion by killing the enemy Bat sitting
 *  on it. Teaches the kill cycle (Monkey > Bat) in a real situation. */
const STEP_RESCUE: TutorialStep = {
  id: 'rescue',
  titleKey: 'tutorial.rescue.title',
  bodyKey: 'tutorial.rescue.body',
  doneKey: 'tutorial.rescue.done',
  pieces: [
    // Lion paralyzed underneath the enemy Bat (same square).
    piece({
      type: 'lion', player: 1, row: 15, col: 7, id: 'lion_p1_tut',
      isParalyzed: true, paralyzedBy: 'bat_p2_tut',
    }),
    piece({
      type: 'bat', player: 2, row: 15, col: 7, id: 'bat_p2_tut',
      paralyzing: 'lion_p1_tut',
    }),
    piece({ type: 'monkey', player: 1, row: 15, col: 8, id: 'monkey_p1_tut' }),
  ],
  selectFrom: { row: 15, col: 8 },
  moveTo:     { row: 15, col: 7 },
  isComplete: (s) => {
    // Bat dead AND Lion no longer paralyzed.
    const bat = s.pieces.find(p => p.id === 'bat_p2_tut');
    const lion = s.pieces.find(p => p.id === 'lion_p1_tut');
    return !bat && !!lion && !lion.isParalyzed;
  },
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  STEP_MOVE,
  STEP_SHIELD,
  STEP_PARALYZE,
  STEP_RESCUE,
];
