import type { PieceType, Orientation } from './types';

export const BOARD_SIZE = 16;

// Throne: 2×2 center (rows 7-8, cols 7-8)
export function isThrone(row: number, col: number): boolean {
  return row >= 7 && row <= 8 && col >= 7 && col <= 8;
}

// Barriers: 4 squares below throne from each player's POV
//   Player 1 (bottom): barrier at row 9, cols 6-9  (south of throne)
//   Player 2 (top):    barrier at row 6, cols 6-9  (north of throne)
//   Total: 8 barrier cells
const BARRIER_SET = new Set<string>([
  // South barriers (blocks Player 1's direct path to throne)
  '9,6', '9,7', '9,8', '9,9',
  // North barriers (blocks Player 2's direct path to throne)
  '6,6', '6,7', '6,8', '6,9',
]);

export function isBarrier(row: number, col: number): boolean {
  return BARRIER_SET.has(`${row},${col}`);
}

export function isInBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

// Life cycle kill map
// Monkey→Bat→Butterfly→Ant→Elephant→Lion, Lion kills any
export const KILL_TARGET: Record<PieceType, PieceType | 'any'> = {
  lion:      'any',
  elephant:  'lion',
  ant:       'elephant',
  butterfly: 'ant',
  bat:       'butterfly',
  monkey:    'bat',
};

export function canPieceKill(attacker: PieceType, target: PieceType): boolean {
  const kt = KILL_TARGET[attacker];
  return kt === 'any' || kt === target;
}

export const PIECE_EMOJI: Record<PieceType, string> = {
  lion:      '🦁',
  elephant:  '🐘',
  ant:       '🐜',
  butterfly: '🦋',
  bat:       '🦇',
  monkey:    '🐒',
};

export const PIECE_NAME: Record<PieceType, string> = {
  lion:      'Lion',
  elephant:  'Elephant',
  ant:       'Ant',
  butterfly: 'Butterfly',
  bat:       'Bat',
  monkey:    'Monkey',
};

/** Order for ant rotation cycle: H → V → diagonal → antidiagonal → H */
export const ORIENTATION_ORDER: Orientation[] = ['horizontal', 'vertical', 'diagonal', 'antidiagonal'];

/** Display labels for ant rotation options */
export const ORIENTATION_LABEL: Record<Orientation, string> = {
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  diagonal: 'Diagonal',
  antidiagonal: 'Antidiagonal',
};

export function getNextOrientation(current: Orientation): Orientation {
  const i = ORIENTATION_ORDER.indexOf(current);
  return ORIENTATION_ORDER[(i + 1) % ORIENTATION_ORDER.length];
}

// ─── Chess-style coordinate labels ──────────────────────────────────────────
// Columns are letters A–P (left to right), rows are numbers 1–16 (bottom to
// top, like a chess board). So row 0 (top of the array) renders as "16" and
// row 15 (bottom) renders as "1". A square is then "A1" (bottom-left) through
// "P16" (top-right).

/** "A".."P" for col 0..15 */
export function colLabel(col: number): string {
  return String.fromCharCode('A'.charCodeAt(0) + col);
}
/** 16..1 for row 0..15 (chess: row 1 is at the bottom of the board). */
export function rowLabel(row: number): number {
  return BOARD_SIZE - row;
}
/** Combined chess square name, e.g. (7, 4) → "E9". */
export function squareLabel(row: number, col: number): string {
  return `${colLabel(col)}${rowLabel(row)}`;
}
