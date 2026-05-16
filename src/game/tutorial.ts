import type { GameState, GamePiece, Player, Position, Orientation } from './types';

/** A single lesson. There are two kinds:
 *
 *  - `move` (default): the classic guided lesson. Ships a sparse piece
 *    set, the cell to click first, and the destination. The tutorial
 *    page blocks every other click so a confused first-timer can't
 *    wander off. Ant lessons additionally surface real rotation /
 *    End-Turn controls (see `rotateTo` / `endTurnCompletes`).
 *
 *  - `callout`: a non-interactive teaching scene. No move is required;
 *    a Next button is always available. Used for the opening UI tour
 *    (`tour: true` renders the faux full-game layout) and any
 *    "show, don't do" explanation. */
export type TutorialStepKind = 'move' | 'callout';

export interface TutorialStep {
  id: string;
  /** Defaults to 'move' when omitted (keeps the original steps terse). */
  kind?: TutorialStepKind;
  /** Locale keys for the title + body line shown above the board. */
  titleKey: string;
  bodyKey: string;
  /** "Done!" message shown after the lesson move lands. Callout steps
   *  never flip to this — they keep showing `bodyKey`. */
  doneKey: string;
  /** Sparse piece set placed on the standard 16×16 board. */
  pieces: GamePiece[];
  /** The cell holding the piece the player should pick up. Omitted on
   *  pure callout steps. */
  selectFrom?: Position;
  /** Cell the player should move that piece to. Omitted when the lesson
   *  is rotation-only (ant) or a callout. */
  moveTo?: Position;
  /** Extra cells to pulse besides the primary highlight — used to point
   *  at "you can't stop here" squares (e.g. the throne) or callout
   *  regions. */
  highlights?: Position[];
  /** Render the faux full-game layout (the opening UI tour) instead of
   *  the bare practice board. Implies `kind: 'callout'`. */
  tour?: boolean;
  /** Ant lessons: the orientation the player must rotate the ant into
   *  for the lesson to count as complete. The real HUD rotation buttons
   *  are shown so this is a genuine interaction. */
  rotateTo?: Orientation;
  /** When true the lesson only completes once the player presses the
   *  real End Turn button (after satisfying `isComplete`). Teaches the
   *  ant's "rotation is free, End Turn commits it" timing. */
  endTurnCompletes?: boolean;
  /** True once the lesson goal is met. Evaluated on the live GameState
   *  after every action (move / rotate / end-turn). Optional — callout
   *  steps are always considered complete. */
  isComplete?: (state: GameState) => boolean;
}

// ─── Helpers to build pieces ────────────────────────────────────────────

function piece(opts: {
  type: GamePiece['type'];
  player: Player;
  row: number;
  col: number;
  id?: string;
  hp?: number;
  /** Damaged elephants render the 💔 broken-heart marker — required for
   *  the "elephant has 2 lives" lesson. The earlier helper hardcoded
   *  this to false, which silently hid the icon even when the preset
   *  set hp=1, making the body card's "see the 💔" copy a lie. */
  isDamaged?: boolean;
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
    isDamaged: opts.isDamaged ?? false,
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
// Throne is the 2×2 centre (rows 7-8, cols 7-8); barriers sit at row 9
// (and row 6) cols 6-9.

/** Lesson 0: the opening UI tour. A non-interactive callout that renders
 *  the faux full-game screen (board + real side panel) so the player can
 *  see every element — board, pieces, barriers, throne, side panel, life
 *  cycle, and the menu / restart / history controls — before any move. */
const STEP_TOUR: TutorialStep = {
  id: 'tour',
  kind: 'callout',
  tour: true,
  titleKey: 'tutorial.tour.title',
  bodyKey: 'tutorial.tour.body',
  doneKey: 'tutorial.tour.body',
  // A representative position so the faux screen looks like a real game:
  // both lions, the throne guarded by barriers, and an ant so the side
  // panel shows the rotation controls.
  pieces: [
    piece({ type: 'lion',      player: 1, row: 15, col: 7,  id: 'tour_lion1' }),
    piece({ type: 'ant',       player: 1, row: 13, col: 5,  id: 'tour_ant1', orientation: 'horizontal' }),
    piece({ type: 'butterfly', player: 1, row: 14, col: 10, id: 'tour_bf1' }),
    piece({ type: 'elephant',  player: 1, row: 12, col: 8,  id: 'tour_ele1' }),
    piece({ type: 'lion',      player: 2, row: 0,  col: 8,  id: 'tour_lion2' }),
    piece({ type: 'bat',       player: 2, row: 2,  col: 6,  id: 'tour_bat2' }),
    piece({ type: 'monkey',    player: 2, row: 1,  col: 10, id: 'tour_monkey2' }),
  ],
};

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

/** Lesson 4: kill a lone enemy Bat by sliding the Monkey across two
 *  squares. Teaches the kill cycle in its simplest form AND the rule
 *  that the killer takes the spot where its target was standing. */
const STEP_MONKEY_BAT: TutorialStep = {
  id: 'monkey-bat',
  titleKey: 'tutorial.monkeyBat.title',
  bodyKey: 'tutorial.monkeyBat.body',
  doneKey: 'tutorial.monkeyBat.done',
  pieces: [
    piece({ type: 'monkey', player: 1, row: 15, col: 6, id: 'monkey_p1_tut' }),
    piece({ type: 'bat',    player: 2, row: 15, col: 8, id: 'bat_p2_tut' }),
  ],
  selectFrom: { row: 15, col: 6 },
  moveTo:     { row: 15, col: 8 },
  isComplete: (s) => {
    const bat = s.pieces.find(p => p.id === 'bat_p2_tut');
    const monkey = s.pieces.find(p => p.id === 'monkey_p1_tut');
    return !bat && !!monkey && monkey.row === 15 && monkey.col === 8;
  },
};

/** Lesson 5: rescue your paralyzed Lion by killing the enemy Bat sitting
 *  on it. Same kill-cycle rule as STEP_MONKEY_BAT in a richer scenario. */
const STEP_RESCUE: TutorialStep = {
  id: 'rescue',
  titleKey: 'tutorial.rescue.title',
  bodyKey: 'tutorial.rescue.body',
  doneKey: 'tutorial.rescue.done',
  pieces: [
    piece({
      type: 'lion', player: 1, row: 15, col: 6, id: 'lion_p1_tut',
      isParalyzed: true, paralyzedBy: 'bat_p2_tut',
    }),
    piece({
      type: 'bat', player: 2, row: 15, col: 6, id: 'bat_p2_tut',
      paralyzing: 'lion_p1_tut',
    }),
    piece({ type: 'monkey', player: 1, row: 15, col: 8, id: 'monkey_p1_tut' }),
  ],
  selectFrom: { row: 15, col: 8 },
  moveTo:     { row: 15, col: 6 },
  isComplete: (s) => {
    const bat = s.pieces.find(p => p.id === 'bat_p2_tut');
    const lion = s.pieces.find(p => p.id === 'lion_p1_tut');
    return !bat && !!lion && !lion.isParalyzed;
  },
};

/** Lesson 6: the Elephant has two lives. Preset state has an enemy
 *  Elephant already at 1 HP (the 💔 marker). The player finishes it off
 *  with their Lion. */
const STEP_ELEPHANT: TutorialStep = {
  id: 'elephant',
  titleKey: 'tutorial.elephant.title',
  bodyKey: 'tutorial.elephant.body',
  doneKey: 'tutorial.elephant.done',
  pieces: [
    piece({ type: 'lion', player: 1, row: 13, col: 7, id: 'lion_p1_tut' }),
    piece({
      type: 'elephant', player: 2, row: 12, col: 7, id: 'elephant_p2_tut',
      hp: 1,
      isDamaged: true,
    }),
  ],
  selectFrom: { row: 13, col: 7 },
  moveTo:     { row: 12, col: 7 },
  isComplete: (s) => {
    const e = s.pieces.find(p => p.id === 'elephant_p2_tut');
    return !e;
  },
};

/** Lesson 7: the Ant moves AND rotates in one turn. Move it one step up,
 *  rotate it to Vertical, then commit with End Turn. Teaches the ant's
 *  signature "one move + one free rotation per turn" rule. */
const STEP_ANT: TutorialStep = {
  id: 'ant',
  titleKey: 'tutorial.ant.title',
  bodyKey: 'tutorial.ant.body',
  doneKey: 'tutorial.ant.done',
  pieces: [
    piece({ type: 'ant', player: 1, row: 13, col: 7, id: 'ant_p1_tut', orientation: 'horizontal' }),
  ],
  selectFrom: { row: 13, col: 7 },
  moveTo:     { row: 12, col: 7 },
  rotateTo:   'vertical',
  endTurnCompletes: true,
  isComplete: (s) => {
    const a = s.pieces.find(p => p.id === 'ant_p1_tut');
    return !!a && a.row === 12 && a.col === 7 && a.orientation === 'vertical';
  },
};

/** Lesson 8: rotation alone is free — you don't have to move. Rotate the
 *  Ant to Diagonal and End Turn without ever moving it. Contrasts the
 *  rotate-only timing with the move+rotate lesson before it. */
const STEP_ANT_ROTATE: TutorialStep = {
  id: 'ant-rotate',
  titleKey: 'tutorial.antRotate.title',
  bodyKey: 'tutorial.antRotate.body',
  doneKey: 'tutorial.antRotate.done',
  pieces: [
    piece({ type: 'ant', player: 1, row: 12, col: 7, id: 'ant_p1_tut', orientation: 'horizontal' }),
  ],
  selectFrom: { row: 12, col: 7 },
  // No moveTo — the board offers no destination, so the only path
  // forward is the rotation buttons in the side panel.
  rotateTo:   'diagonal',
  endTurnCompletes: true,
  isComplete: (s) => {
    const a = s.pieces.find(p => p.id === 'ant_p1_tut');
    return !!a && a.row === 12 && a.col === 7 && a.orientation === 'diagonal';
  },
};

/** Lesson 9: defend with a rotation. An enemy Butterfly is lined up on
 *  the diagonal that runs straight into the Ant's centre (Butterfly
 *  kills Ant). Rotate the Ant to Antidiagonal so a wing drops onto that
 *  diagonal and blocks the Butterfly's path — wings are impassable. */
const STEP_ANT_DEFEND: TutorialStep = {
  id: 'ant-defend',
  titleKey: 'tutorial.antDefend.title',
  bodyKey: 'tutorial.antDefend.body',
  doneKey: 'tutorial.antDefend.done',
  pieces: [
    piece({ type: 'ant',       player: 1, row: 12, col: 7,  id: 'ant_p1_tut', orientation: 'horizontal' }),
    piece({ type: 'butterfly', player: 2, row: 9,  col: 10, id: 'butterfly_p2_tut' }),
  ],
  selectFrom: { row: 12, col: 7 },
  highlights: [{ row: 9, col: 10 }, { row: 11, col: 8 }],
  rotateTo:   'antidiagonal',
  endTurnCompletes: true,
  isComplete: (s) => {
    const a = s.pieces.find(p => p.id === 'ant_p1_tut');
    return !!a && a.orientation === 'antidiagonal';
  },
};

/** Lesson 10: no piece may STOP on the throne — but the Elephant glides
 *  straight THROUGH it. Slide the Elephant along row 8 across the throne
 *  to the far side; the throne squares are never offered as a stop. */
const STEP_ELEPHANT_THRONE: TutorialStep = {
  id: 'elephant-throne',
  titleKey: 'tutorial.elephantThrone.title',
  bodyKey: 'tutorial.elephantThrone.body',
  doneKey: 'tutorial.elephantThrone.done',
  pieces: [
    piece({ type: 'elephant', player: 1, row: 8, col: 4, id: 'elephant_p1_tut' }),
  ],
  selectFrom: { row: 8, col: 4 },
  moveTo:     { row: 8, col: 10 },
  highlights: [{ row: 8, col: 7 }, { row: 8, col: 8 }],
  isComplete: (s) => {
    const e = s.pieces.find(p => p.id === 'elephant_p1_tut');
    return !!e && e.row === 8 && e.col === 10;
  },
};

/** Lesson 11: the Bat hunts the Butterfly — and a Butterfly can never
 *  shield a Bat, so your Bat is a safe Butterfly-killer. Slide the Bat
 *  diagonally onto the enemy Butterfly. */
const STEP_BAT_BUTTERFLY: TutorialStep = {
  id: 'bat-butterfly',
  titleKey: 'tutorial.batButterfly.title',
  bodyKey: 'tutorial.batButterfly.body',
  doneKey: 'tutorial.batButterfly.done',
  pieces: [
    piece({ type: 'bat',       player: 1, row: 13, col: 4,  id: 'bat_p1_tut' }),
    piece({ type: 'butterfly', player: 2, row: 10, col: 7,  id: 'butterfly_p2_tut' }),
  ],
  selectFrom: { row: 13, col: 4 },
  moveTo:     { row: 10, col: 7 },
  isComplete: (s) => {
    const b = s.pieces.find(p => p.id === 'butterfly_p2_tut');
    return !b;
  },
};

/** Lesson 12 (finale): the Lion kills ANY piece in its path, and landing
 *  on the throne wins outright. No piece may ever STOP on the throne, so
 *  the throne itself stays empty — the Lion is hemmed in by enemies and
 *  the single winning move is one step onto the empty throne. */
const STEP_LION_FINALE: TutorialStep = {
  id: 'lion-finale',
  titleKey: 'tutorial.lionFinale.title',
  bodyKey: 'tutorial.lionFinale.body',
  doneKey: 'tutorial.lionFinale.done',
  pieces: [
    piece({ type: 'lion',      player: 1, row: 7,  col: 6,  id: 'lion_p1_tut' }),
    piece({ type: 'bat',       player: 2, row: 8,  col: 6,  id: 'bat_p2_tut' }),
    piece({ type: 'butterfly', player: 2, row: 7,  col: 5,  id: 'bf_p2_tut' }),
    piece({ type: 'monkey',    player: 2, row: 8,  col: 5,  id: 'monkey_p2_tut' }),
    piece({ type: 'ant',       player: 2, row: 10, col: 3,  id: 'ant_p2_tut', orientation: 'horizontal' }),
  ],
  selectFrom: { row: 7, col: 6 },
  moveTo:     { row: 7, col: 7 },
  highlights: [{ row: 7, col: 8 }, { row: 8, col: 7 }, { row: 8, col: 8 }],
  isComplete: (s) => s.phase === 'won' && s.winner === 1,
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  STEP_TOUR,
  STEP_MOVE,
  STEP_SHIELD,
  STEP_PARALYZE,
  STEP_MONKEY_BAT,
  STEP_RESCUE,
  STEP_ELEPHANT,
  STEP_ANT,
  STEP_ANT_ROTATE,
  STEP_ANT_DEFEND,
  STEP_ELEPHANT_THRONE,
  STEP_BAT_BUTTERFLY,
  STEP_LION_FINALE,
];
