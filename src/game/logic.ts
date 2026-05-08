import { GamePiece, GameState, Player, Position, Orientation, PieceType, BounceEffect, ActionMessage, HistorySnapshot, Clocks } from './types';
import { isInBounds, isThrone, isBarrier, canPieceKill, BOARD_SIZE, ORIENTATION_ORDER } from './constants';

// ─── History helper ──────────────────────────────────────────────────────────
// Cap so a long replay-game doesn't bloat sessionStorage indefinitely.
const HISTORY_LIMIT = 250;

// ─── Time control / clocks ───────────────────────────────────────────────────
// Single source of truth for clock arithmetic on a turn flip. The active
// player is the one whose turn is *ending* (about to flip to the other
// side). We:
//   1. compute elapsed since clocks.startedAt and subtract from their
//      match clock (and the per-move clock if one is active),
//   2. flag timeout if either clock hit zero,
//   3. add Fischer increment to the player who just acted,
//   4. reset the per-move clock for whoever is about to play,
//   5. stamp startedAt = now so the new active player's clock starts
//      counting from this instant.
//
// Returns either:
//   { timedOut: false, clocks } — happy path; caller uses `clocks`
//   { timedOut: true,  losingPlayer } — caller flips phase='won' with
//                                        the OTHER player as winner.

interface ClockTickHappy { timedOut: false; clocks: Clocks }
interface ClockTickLoss  { timedOut: true;  losingPlayer: Player }
type ClockTickResult = ClockTickHappy | ClockTickLoss;

function tickClockOnTurnFlip(state: GameState, actingPlayer: Player): ClockTickResult | null {
  const tc = state.timeControl;
  if (!tc || tc.kind !== 'clock' || !state.clocks) return null;
  const elapsed = Math.max(
    0,
    Math.floor((Date.now() - new Date(state.clocks.startedAt).getTime()) / 1000),
  );
  const matchKey = actingPlayer === 1 ? 'p1Seconds' : 'p2Seconds';
  const remaining = state.clocks[matchKey] - elapsed;
  // Per-move clock only "expires" if the player set one (>0); a 0 cap
  // means no per-move limit, so we never time out on it.
  const perMoveExpired = state.clocks.perMoveSeconds > 0
    && elapsed > state.clocks.perMoveSeconds;
  if (remaining <= 0 || perMoveExpired) {
    return { timedOut: true, losingPlayer: actingPlayer };
  }
  const matchAfter = remaining + (tc.increment ?? 0);
  const nextClocks: Clocks = {
    p1Seconds: actingPlayer === 1 ? matchAfter : state.clocks.p1Seconds,
    p2Seconds: actingPlayer === 2 ? matchAfter : state.clocks.p2Seconds,
    perMoveSeconds: tc.perMoveSeconds,
    startedAt: new Date().toISOString(),
  };
  return { timedOut: false, clocks: nextClocks };
}

/** Apply clock-tick result to a candidate next-state. If the active player
 *  ran out of time, override the next-state with a 'won' phase for the
 *  other side. Otherwise merge in the new clocks. */
function applyClockTick(
  next: GameState,
  tick: ClockTickResult | null,
): GameState {
  if (!tick) return next;
  if (tick.timedOut) {
    const winner: Player = tick.losingPlayer === 1 ? 2 : 1;
    return {
      ...next,
      phase: 'won',
      winner,
      lastAction: { key: 'action.timeout', vars: { n: winner } },
      // Keep the clocks as-is (with the loser at 0) for the post-game review.
      clocks: next.clocks
        ? {
            ...next.clocks,
            [tick.losingPlayer === 1 ? 'p1Seconds' : 'p2Seconds']: 0,
          } as Clocks
        : next.clocks,
    };
  }
  return { ...next, clocks: tick.clocks };
}

function pushHistory(
  state: GameState,
  pieces: GamePiece[],
  currentPlayer: Player,
  lastAction: ActionMessage,
  turn: number,
): HistorySnapshot[] {
  // Deep-clone pieces so subsequent mutations to the live array can't bleed
  // into the snapshot.
  const snapshot: HistorySnapshot = {
    pieces: pieces.map(p => ({ ...p })),
    currentPlayer,
    lastAction,
    turn,
  };
  const next = [...state.history, snapshot];
  if (next.length > HISTORY_LIMIT) next.splice(0, next.length - HISTORY_LIMIT);
  return next;
}

// ─── Ant geometry ────────────────────────────────────────────────────────────

export function getAntCells(row: number, col: number, orientation: Orientation): Position[] {
  switch (orientation) {
    case 'horizontal':
      return [{ row, col: col - 1 }, { row, col }, { row, col: col + 1 }];
    case 'vertical':
      return [{ row: row - 1, col }, { row, col }, { row: row + 1, col }];
    case 'diagonal':
      return [{ row: row - 1, col: col - 1 }, { row, col }, { row: row + 1, col: col + 1 }];
    case 'antidiagonal':
      return [{ row: row - 1, col: col + 1 }, { row, col }, { row: row + 1, col: col - 1 }];
    default:
      return [{ row, col: col - 1 }, { row, col }, { row, col: col + 1 }];
  }
}

function getAntWings(row: number, col: number, orientation: Orientation): Position[] {
  const all = getAntCells(row, col, orientation);
  return all.filter(c => !(c.row === row && c.col === col)); // exclude center
}

// ─── Board queries ────────────────────────────────────────────────────────────

/**
 * For RENDERING: returns any piece that "occupies" this cell, including ant wings.
 */
export function getPiecesAtCell(pieces: GamePiece[], row: number, col: number): GamePiece[] {
  return pieces.filter(p => {
    if (p.type === 'ant') {
      return getAntCells(p.row, p.col, p.orientation!).some(c => c.row === row && c.col === col);
    }
    return p.row === row && p.col === col;
  });
}

/**
 * For COMBAT: returns the piece that can be interacted with at this cell.
 * For ants: only their CENTER cell (wings are impassable barriers, not targets).
 * Prefers an overlay piece (butterfly shielding / bat paralyzing) so an enemy
 * overlay correctly shadows an own piece underneath it.
 */
export function getInteractiveAtCell(
  pieces: GamePiece[],
  row: number,
  col: number,
  excludeId?: string
): GamePiece | null {
  const here = pieces.filter(p => {
    if (excludeId && p.id === excludeId) return false;
    return p.row === row && p.col === col;
  });
  if (here.length === 0) return null;
  const overlay = here.find(p => p.shielding !== undefined || p.paralyzing !== undefined);
  return overlay ?? here[0];
}

/**
 * Returns true if an ant (other than excludeId) has a WING at (row, col).
 * Wings act as impassable barriers.
 */
function isAntWingAt(pieces: GamePiece[], row: number, col: number, excludeId?: string): boolean {
  return pieces.some(p => {
    if (p.type !== 'ant') return false;
    if (excludeId && p.id === excludeId) return false;
    const wings = getAntWings(p.row, p.col, p.orientation!);
    return wings.some(w => w.row === row && w.col === col);
  });
}

/** True when (row, col) cannot be a final landing square for the monkey
 *  after killing a bat — used to walk back along the lunge axis when the
 *  natural "stand adjacent" cell is blocked. The monkey id is excluded
 *  from the occupancy check so its own original cell counts as empty
 *  (the monkey is mid-move). The dying bat is also excluded. */
function isMonkeyLandingBlocked(
  pieces: GamePiece[],
  row: number,
  col: number,
  monkeyId: string,
  dyingPieceId: string,
): boolean {
  if (!isInBounds(row, col)) return true;
  if (isBarrier(row, col)) return true;
  if (isThrone(row, col)) return true;
  // Ant wing of any other ant (the original bug — the paralysed ant's
  // wing sat exactly where the monkey wanted to land, so the monkey
  // got drawn under the wing).
  if (isAntWingAt(pieces, row, col, monkeyId)) return true;
  return pieces.some(p =>
    p.id !== monkeyId && p.id !== dyingPieceId && p.row === row && p.col === col,
  );
}

/** The "top" piece in combat at a cell: butterfly/bat overlay takes priority. */
function getTopForCombat(pieces: GamePiece[], row: number, col: number): GamePiece | null {
  const all = pieces.filter(p => p.row === row && p.col === col);
  if (all.length === 0) return null;
  const overlay = all.find(p => p.shielding !== undefined || p.paralyzing !== undefined);
  return overlay ?? all[0];
}

/** When top is butterfly shielding, can this attacker legally move to this cell? */
function canAttackShieldedCell(attackerType: PieceType, top: GamePiece, pieces: GamePiece[]): boolean {
  if (top.type !== 'butterfly' || !top.shielding) return false;
  const shielded = pieces.find(p => p.id === top.shielding);
  if (!shielded) return false;
  return canPieceKill(attackerType, shielded.type);
}

/** May stop on enemy cell: kill top, shielded target, or paralyzed piece under enemy bat (kill cycle). */
function canAttackEnemyCell(attacker: GamePiece, pieces: GamePiece[], row: number, col: number): boolean {
  const top = getTopForCombat(pieces, row, col);
  if (!top || top.player === attacker.player) return false;
  if (canPieceKill(attacker.type, top.type)) return true;
  if (canAttackShieldedCell(attacker.type, top, pieces)) return true;
  if (top.type === 'bat' && top.paralyzing) {
    const paralyzed = pieces.find(p => p.id === top.paralyzing);
    if (paralyzed && paralyzed.player !== attacker.player && canPieceKill(attacker.type, paralyzed.type))
      return true;
  }
  return false;
}

/** True if the attacker can lunge through its OWN bat at (row, col): the bat is
 *  paralyzing an enemy piece this attacker can kill via the kill cycle. The
 *  attacker stops on the bat's cell logically (target square), but in resolution
 *  the bat keeps the cell and the attacker bounces to the adjacent square. */
function canLungeThroughOwnBat(attacker: GamePiece, pieces: GamePiece[], row: number, col: number): boolean {
  if (attacker.type === 'bat') return false;
  const ownBat = pieces.find(p =>
    p.id !== attacker.id
    && p.type === 'bat'
    && p.player === attacker.player
    && p.paralyzing
    && p.row === row
    && p.col === col
  );
  if (!ownBat) return false;
  const paralyzed = pieces.find(p => p.id === ownBat.paralyzing);
  if (!paralyzed || paralyzed.player === attacker.player) return false;
  return canPieceKill(attacker.type, paralyzed.type);
}

// ─── Move validation ──────────────────────────────────────────────────────────

export function getValidMoves(
  piece: GamePiece,
  pieces: GamePiece[]
): { moves: Position[]; canRotate: boolean; validRotations: Orientation[] } {
  if (piece.isParalyzed) return { moves: [], canRotate: false, validRotations: [] };

  switch (piece.type) {
    case 'lion':      return { moves: getLionMoves(piece, pieces),      canRotate: false, validRotations: [] };
    case 'elephant':  return { moves: getElephantMoves(piece, pieces),  canRotate: false, validRotations: [] };
    case 'ant':       return getAntMoves(piece, pieces);
    case 'butterfly': return { moves: getButterflyMoves(piece, pieces), canRotate: false, validRotations: [] };
    case 'bat':       return { moves: getBatMoves(piece, pieces),       canRotate: false, validRotations: [] };
    case 'monkey':    return { moves: getMonkeyMoves(piece, pieces),    canRotate: false, validRotations: [] };
    default:          return { moves: [], canRotate: false, validRotations: [] };
  }
}

// ─── Lion ─────────────────────────────────────────────────────────────────────

function getLionMoves(piece: GamePiece, pieces: GamePiece[]): Position[] {
  const moves: Position[] = [];
  const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (const [dr, dc] of dirs) {
    const nr = piece.row + dr;
    const nc = piece.col + dc;
    if (!isInBounds(nr, nc)) continue;
    if (isBarrier(nr, nc)) continue;
    if (isAntWingAt(pieces, nr, nc, piece.id)) continue;

    // Lion can stop on throne (win condition)
    if (isThrone(nr, nc)) { moves.push({ row: nr, col: nc }); continue; }

    const interactive = getInteractiveAtCell(pieces, nr, nc, piece.id);
    if (!interactive) {
      moves.push({ row: nr, col: nc });
    } else if (interactive.player !== piece.player) {
      if (canAttackEnemyCell(piece, pieces, nr, nc)) moves.push({ row: nr, col: nc });
    } else if (canLungeThroughOwnBat(piece, pieces, nr, nc)) {
      moves.push({ row: nr, col: nc });
    }
  }
  return moves;
}

// ─── Elephant ─────────────────────────────────────────────────────────────────

function getElephantMoves(piece: GamePiece, pieces: GamePiece[]): Position[] {
  const moves: Position[] = [];
  const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const onCooldown = (piece.cooldown ?? 0) > 0;

  for (const [dr, dc] of dirs) {
    for (let s = 1; s < BOARD_SIZE; s++) {
      const nr = piece.row + dr * s;
      const nc = piece.col + dc * s;
      if (!isInBounds(nr, nc)) break;
      if (isBarrier(nr, nc)) break;
      if (isAntWingAt(pieces, nr, nc, piece.id)) break;

      if (isThrone(nr, nc)) continue; // pass through throne, can't stop

      const interactive = getInteractiveAtCell(pieces, nr, nc, piece.id);
      if (!interactive) {
        moves.push({ row: nr, col: nc });
      } else {
        if (interactive.player !== piece.player) {
          // While on cooldown, the elephant cannot attack at all.
          if (!onCooldown && canAttackEnemyCell(piece, pieces, nr, nc))
            moves.push({ row: nr, col: nc });
        } else if (!onCooldown && canLungeThroughOwnBat(piece, pieces, nr, nc)) {
          moves.push({ row: nr, col: nc });
        }
        break;
      }
    }
  }
  return moves;
}

// ─── Butterfly ────────────────────────────────────────────────────────────────

function getButterflyMoves(piece: GamePiece, pieces: GamePiece[]): Position[] {
  const moves: Position[] = [];
  const dirs: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  for (const [dr, dc] of dirs) {
    for (let s = 1; s < BOARD_SIZE; s++) {
      const nr = piece.row + dr * s;
      const nc = piece.col + dc * s;
      if (!isInBounds(nr, nc)) break;
      if (isBarrier(nr, nc)) break;
      if (isAntWingAt(pieces, nr, nc, piece.id)) break;
      if (isThrone(nr, nc)) continue;

      const interactive = getInteractiveAtCell(pieces, nr, nc, piece.id);
      if (!interactive) {
        moves.push({ row: nr, col: nc });
      } else if (interactive.player === piece.player) {
        // Shield own piece (not butterfly/bat, not already shielded)
        if (!interactive.shieldedBy && interactive.type !== 'butterfly' && interactive.type !== 'bat') {
          moves.push({ row: nr, col: nc });
        } else if (canLungeThroughOwnBat(piece, pieces, nr, nc)) {
          moves.push({ row: nr, col: nc });
        }
        break;
      } else {
        if (canAttackEnemyCell(piece, pieces, nr, nc)) moves.push({ row: nr, col: nc });
        break;
      }
    }
  }
  return moves;
}

// ─── Bat ──────────────────────────────────────────────────────────────────────

function getBatMoves(piece: GamePiece, pieces: GamePiece[]): Position[] {
  const moves: Position[] = [];
  const dirs: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  for (const [dr, dc] of dirs) {
    for (let s = 1; s < BOARD_SIZE; s++) {
      const nr = piece.row + dr * s;
      const nc = piece.col + dc * s;
      if (!isInBounds(nr, nc)) break;
      if (isBarrier(nr, nc)) break;
      if (isAntWingAt(pieces, nr, nc, piece.id)) break;
      if (isThrone(nr, nc)) continue;

      const interactive = getInteractiveAtCell(pieces, nr, nc, piece.id);
      if (!interactive) {
        moves.push({ row: nr, col: nc });
      } else if (interactive.player !== piece.player) {
        const top = getTopForCombat(pieces, nr, nc);
        if (!top) { break; }
        // Bat: kill butterfly (or butterfly shielding → land and paralyze shielded), or paralyze any non-bat
        if (top.type === 'butterfly')
          moves.push({ row: nr, col: nc });
        else if (top.type !== 'bat' && !top.paralyzedBy)
          moves.push({ row: nr, col: nc });
        break;
      } else {
        break; // own piece
      }
    }
  }
  return moves;
}

// ─── Monkey ───────────────────────────────────────────────────────────────────

function getMonkeyMoves(piece: GamePiece, pieces: GamePiece[]): Position[] {
  const moves: Position[] = [];
  const dirs: [number, number][] = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];

  for (const [dr, dc] of dirs) {
    for (let s = 1; s <= 4; s++) {
      const nr = piece.row + dr * s;
      const nc = piece.col + dc * s;
      if (!isInBounds(nr, nc)) break;

      // Monkey jumps over barriers and ant wings (can't stop on them)
      if (isBarrier(nr, nc)) continue;
      if (isAntWingAt(pieces, nr, nc, piece.id)) continue;
      if (isThrone(nr, nc)) continue;

      const interactive = getInteractiveAtCell(pieces, nr, nc, piece.id);
      if (!interactive) {
        moves.push({ row: nr, col: nc });
      } else if (interactive.player === piece.player) {
        // Lunge through own bat if it's paralyzing a kill-cycle target
        if (canLungeThroughOwnBat(piece, pieces, nr, nc)) {
          moves.push({ row: nr, col: nc });
        }
        // Own piece: jump over (continue scanning further cells in this direction)
        continue;
      } else {
        // Enemy: bat (incl. paralyzing stack), shielded cell, or paralyzed-under-bat per cycle
        if (canAttackEnemyCell(piece, pieces, nr, nc)) moves.push({ row: nr, col: nc });
      }
    }
  }
  return moves;
}

// ─── Ant ──────────────────────────────────────────────────────────────────────

/** Returns true if the ant can rotate into the given orientation (body cells clear). */
function canAntRotateTo(piece: GamePiece, newOri: Orientation, pieces: GamePiece[]): boolean {
  const rotatedCells = getAntCells(piece.row, piece.col, newOri);
  return rotatedCells.every(cell => {
    if (!isInBounds(cell.row, cell.col)) return false;
    if (isBarrier(cell.row, cell.col)) return false;
    if (isThrone(cell.row, cell.col)) return false;
    if (cell.row === piece.row && cell.col === piece.col) return true; // center always clear for self
    const blocker = pieces.find(p => {
      if (p.id === piece.id) return false;
      if (p.type === 'ant') {
        return getAntCells(p.row, p.col, p.orientation!).some(c => c.row === cell.row && c.col === cell.col);
      }
      return p.row === cell.row && p.col === cell.col;
    });
    return !blocker;
  });
}

/** Returns list of orientations the ant can rotate into (excludes current). Only valid options. */
function getValidAntRotations(piece: GamePiece, pieces: GamePiece[]): Orientation[] {
  const current = piece.orientation!;
  return ORIENTATION_ORDER.filter(ori => ori !== current && canAntRotateTo(piece, ori, pieces));
}

function getAntMoves(piece: GamePiece, pieces: GamePiece[]): { moves: Position[]; canRotate: boolean; validRotations: Orientation[] } {
  const moves: Position[] = [];
  const orientation = piece.orientation!;
  const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const others = pieces.filter(p => p.id !== piece.id);
  const shieldingButterflyId = piece.shieldedBy;

  // True if a wing cell at (r, c) is free for THIS ant to land on. The wing
  // cell must be on the board, not a barrier or throne, not occupied by any
  // other piece's body or wing. `dyingId` is the id of an enemy piece this
  // ant is about to capture — that piece is excluded from blocker checks
  // (including its ant-wings, if it's an ant) since it will be removed by
  // the time we land.
  function wingCellFree(r: number, c: number, dyingId?: string): boolean {
    if (!isInBounds(r, c)) return false;
    if (isBarrier(r, c)) return false;
    if (isThrone(r, c)) return false;
    // Ant-wing of any OTHER ant occupying (r, c). Excludes the dying piece.
    const blockedByWing = others.some(p => {
      if (p.type !== 'ant') return false;
      if (shieldingButterflyId && p.id === shieldingButterflyId) return false;
      if (dyingId && p.id === dyingId) return false;
      return getAntCells(p.row, p.col, p.orientation!).some(c2 => c2.row === r && c2.col === c);
    });
    if (blockedByWing) return false;
    const blocker = others.find(p => {
      if (shieldingButterflyId && p.id === shieldingButterflyId) return false;
      if (dyingId && p.id === dyingId) return false;
      if (p.type === 'ant') return false; // wings handled above
      return p.row === r && p.col === c;
    });
    return !blocker;
  }

  for (const [dr, dc] of dirs) {
    for (let s = 1; s <= 4; s++) {
      const nr = piece.row + dr * s;
      const nc = piece.col + dc * s;

      // Center must be a legal cell. Off-board / barrier / throne ends this
      // direction's slide.
      if (!isInBounds(nr, nc) || isBarrier(nr, nc) || isThrone(nr, nc)) break;

      const wingCells = getAntCells(nr, nc, orientation).filter(c => !(c.row === nr && c.col === nc));

      // Inspect what's at the centre.
      const interactive = getInteractiveAtCell(others, nr, nc);
      let canAttack = false;
      let centreEmpty = false;
      // Set when we'd capture an enemy at the centre — its body+wings are
      // about to vanish, so they don't count against our wing-fit check.
      let dyingId: string | undefined;

      if (!interactive) {
        centreEmpty = true;
      } else if (interactive.player !== piece.player) {
        // Enemy at centre — kill-cycle / shielded / paralysed-under-bat
        const top = getTopForCombat(others, nr, nc);
        if (top) {
          const batParalyzing = top.type === 'bat' && top.paralyzing;
          const paralyzedPiece = batParalyzing
            ? others.find(p => p.id === top.paralyzing && p.player !== piece.player)
            : null;
          if (paralyzedPiece) {
            if (canPieceKill('ant', paralyzedPiece.type) || canAttackShieldedCell('ant', top, others)) {
              canAttack = true;
              dyingId = paralyzedPiece.id;
            }
          } else if (canPieceKill('ant', top.type) || canAttackShieldedCell('ant', top, others)) {
            canAttack = true;
            dyingId = top.id;
          }
        }
      } else {
        // Own piece at centre — only legal target is our own bat paralysing
        // a kill-cycle enemy (lunge). Anything else stops the slide.
        if (canLungeThroughOwnBat(piece, others, nr, nc)) {
          canAttack = true;
          // The bat doesn't die — only the paralysed enemy does. Identify
          // the paralysed piece so its wings (if it's an ant) don't block us.
          const ownBat = others.find(p =>
            p.type === 'bat' && p.player === piece.player && p.paralyzing && p.row === nr && p.col === nc
          );
          if (ownBat?.paralyzing) dyingId = ownBat.paralyzing;
        } else {
          break;
        }
      }

      // Wing cells must ALL fit. If any wing is blocked, the ant can't
      // physically stand here — neither for a plain move nor for a kill.
      // Previously the code allowed wing overlap when there was an attack
      // target, which let the ant fold into invalid shapes after a capture
      // (e.g. attacking an elephant that sat in front of a bat — the wing
      // ended up on the bat).
      const wingsFit = wingCells.every(c => wingCellFree(c.row, c.col, dyingId));

      if (canAttack) {
        if (wingsFit) moves.push({ row: nr, col: nc });
        break; // can't slide past the attacked cell either way
      }
      if (centreEmpty) {
        if (wingsFit) moves.push({ row: nr, col: nc });
        continue;
      }
      break;
    }
  }

  const validRotations = getValidAntRotations(piece, pieces);
  return { moves, canRotate: validRotations.length > 0, validRotations };
}

// ─── Apply Move ───────────────────────────────────────────────────────────────

export interface MoveResult {
  newState: GameState;
  bounceEffect: BounceEffect | null;
}

export function applyMove(state: GameState, pieceId: string, targetRow: number, targetCol: number): GameState {
  const piece = state.pieces.find(p => p.id === pieceId);
  if (!piece) return state;

  let pieces = state.pieces.map(p => ({ ...p }));
  const mp = pieces.find(p => p.id === pieceId)!;
  
  // Track ant's original position when it first moves (if not already tracked)
  let antOriginalPosition = state.antOriginalPosition;
  if (piece.type === 'ant' && !antOriginalPosition) {
    antOriginalPosition = { row: piece.row, col: piece.col };
  }

  // Direction from attacker to target (normalized)
  const dr = Math.sign(targetRow - piece.row);
  const dc = Math.sign(targetCol - piece.col);

  let lastAction: ActionMessage | null = null;
  let winner: Player | null = null;
  let phase = state.phase;
  let bounceEffect: BounceEffect | undefined;

  // Release any current effects the moving piece had
  if (mp.type === 'butterfly' && mp.shielding) {
    const shielded = pieces.find(p => p.id === mp.shielding);
    if (shielded) shielded.shieldedBy = undefined;
    mp.shielding = undefined;
  }
  if (mp.type === 'bat' && mp.paralyzing) {
    const paralyzed = pieces.find(p => p.id === mp.paralyzing);
    if (paralyzed) { paralyzed.isParalyzed = false; paralyzed.paralyzedBy = undefined; }
    mp.paralyzing = undefined;
  }

  // Find what's at the target cell
  const interactive = getInteractiveAtCell(pieces, targetRow, targetCol, pieceId);
  const ownAtTarget = interactive?.player === piece.player ? interactive : null;
  let enemyAtTarget = interactive && interactive.player !== piece.player ? interactive : null;

  // Lunge-through-own-bat: if my own bat is on the target cell paralyzing an
  // enemy I can kill via the kill cycle, treat the paralyzed enemy as the
  // combat target. The existing combat branch (`enemyAtTarget` truthy →
  // paralyzedPiece sub-branch) then resolves it: paralyzed enemy
  // dies/damaged, bat keeps the cell, attacker stops adjacent.
  let lungeThroughOwnBat = false;
  if (!enemyAtTarget && ownAtTarget && ownAtTarget.type === 'bat' && ownAtTarget.paralyzing && mp.type !== 'bat') {
    const par = pieces.find(p => p.id === ownAtTarget.paralyzing);
    if (par && par.player !== mp.player && canPieceKill(mp.type, par.type)) {
      enemyAtTarget = par;
      lungeThroughOwnBat = true;
    }
  }

  let targetSurvived = false; // if true → attacker bounces
  let paralyzedPieceKilled = false; // flag to skip normal position setting when paralyzed piece is killed
  let monkeyKilledBat = false; // monkey stands adjacent + bounce animation; must not overwrite position below

  // ── Butterfly: shield own piece ───────────────────────────────────────────
  // Skip shield branch when this is actually a lunge through our own bat —
  // the bat-paralyzing-enemy underneath is the real target, handled below.
  if (mp.type === 'butterfly' && ownAtTarget && !lungeThroughOwnBat) {
    const ally = pieces.find(p => p.id === ownAtTarget.id)!;
    if (!ally.shieldedBy && ally.type !== 'butterfly' && ally.type !== 'bat') {
      mp.shielding = ally.id;
      ally.shieldedBy = pieceId;
      lastAction = { key: 'action.butterflyShields', vars: { name: ally.type } };
    }
    mp.row = targetRow;
    mp.col = targetCol;
  }
  // ── Combat ────────────────────────────────────────────────────────────────
  else if (enemyAtTarget) {
    const top = getTopForCombat(pieces, targetRow, targetCol);

    if (!top) {
      mp.row = targetRow;
      mp.col = targetCol;
    } else {
      const butterflyShielding = top.type === 'butterfly' && top.shielding;
      const shieldedPiece = butterflyShielding ? pieces.find(p => p.id === top.shielding) : null;
      
      // PRIORITY: Check if bat is paralyzing another piece - this should be checked FIRST for ALL attackers
      // Paralyzed piece can be killed if attacker can kill it according to the kill cycle
      const batParalyzing = top.type === 'bat' && top.paralyzing;
      // Find the paralyzed piece - bat and paralyzed piece are at the same cell
      const paralyzedPiece = batParalyzing ? pieces.find(p => p.id === top.paralyzing) : null;

      // Monkey kills bat. Two cases:
      //  - Bat alone (not paralyzing): monkey moves INTO the bat's square.
      //  - Bat paralyzing another piece: monkey lunges, kills the bat,
      //    and stands in front — bounce animation, paralyzed piece freed.
      // Skip when the bat belongs to the monkey's own player — that case is
      // a lunge-through-own-bat to kill the paralyzed enemy underneath, not
      // a bat kill.
      if (mp.type === 'monkey' && top.type === 'bat' && top.player !== mp.player && canPieceKill('monkey', 'bat')) {
        const paralyzingId = top.paralyzing;
        const result = killPiece(pieces, top.id, mp);
        pieces = result.pieces;
        lastAction = result.action;
        const mp2 = pieces.find(p => p.id === pieceId)!;

        if (paralyzingId) {
          // Bat WAS paralyzing — keep the lunge animation and stand adjacent.
          //
          // Bug fix (Monkey - Ant paralyzed): when the bat was on top of a
          // VERTICAL or HORIZONTAL ant, the cell directly behind the bat
          // along the lunge axis was the ant's WING, not an open square.
          // The monkey would still land there and visually disappear under
          // the wing. Walk back along (-dr, -dc) until we find a square
          // that's actually free (not a wing, barrier, throne, or other
          // piece). Each cell on the lunge path was passable for the
          // monkey on the way in, so the search always terminates well
          // before the board edge.
          let stepBack = 1;
          let landingRow = targetRow - dr;
          let landingCol = targetCol - dc;
          while (
            stepBack < BOARD_SIZE &&
            isMonkeyLandingBlocked(pieces, landingRow, landingCol, pieceId, top.id)
          ) {
            stepBack++;
            const nextR = targetRow - stepBack * dr;
            const nextC = targetCol - stepBack * dc;
            if (!isInBounds(nextR, nextC)) break;
            landingRow = nextR;
            landingCol = nextC;
          }
          mp2.row = landingRow;
          mp2.col = landingCol;
          bounceEffect = { pieceId, dr, dc };
          const released = pieces.find(p => p.id === paralyzingId);
          if (released) {
            released.isParalyzed = false;
            released.paralyzedBy = undefined;
          }
        } else {
          // Bat alone — monkey lands on the bat's square (normal kill move).
          mp2.row = targetRow;
          mp2.col = targetCol;
        }

        // Bring along any butterfly shielding the monkey.
        if (mp2.shieldedBy) {
          const butterfly = pieces.find(p => p.id === mp2.shieldedBy);
          if (butterfly) {
            butterfly.row = mp2.row;
            butterfly.col = mp2.col;
          }
        }

        targetSurvived = false;
        monkeyKilledBat = true;
      }
      // If attacking paralyzed piece under bat, handle it according to kill cycle and HP rules
      // Check that paralyzed piece exists, is an enemy, attacker is not a bat, and attacker can kill paralyzed piece
      if (!monkeyKilledBat && paralyzedPiece && paralyzedPiece.player !== mp.player && mp.type !== 'bat' && canPieceKill(mp.type, paralyzedPiece.type)) {
        // Store the paralyzed piece's position
        const paralyzedRow = paralyzedPiece.row;
        const paralyzedCol = paralyzedPiece.col;
        
        // Handle elephant's 2 HP: first hit damages, second hit kills
        if (paralyzedPiece.type === 'elephant' && paralyzedPiece.hp > 1) {
          // First hit: damage the paralyzed elephant
          const elephant = pieces.find(p => p.id === paralyzedPiece.id)!;
          elephant.hp -= 1;
          elephant.isDamaged = true;
          lastAction = { key: 'action.paralyzedElephantDamaged' };
          targetSurvived = true; // Elephant survives, attacker bounces
          paralyzedPieceKilled = false; // Not killed yet
        } else {
          // Kill the paralyzed piece (either not an elephant, or elephant at 1 HP)
          const result = killPiece(pieces, paralyzedPiece.id, mp);
          pieces = result.pieces;
          lastAction = result.action;
          
          // Bat drops down to stand in the paralyzed piece's place (where it was paralyzing)
          const bat = pieces.find(p => p.id === top.id);
          if (bat) {
            bat.row = paralyzedRow;
            bat.col = paralyzedCol;
            bat.paralyzing = undefined; // No longer paralyzing since piece is dead
          }
          
          // Attacker stands in front (adjacent cell) - set position here and skip the normal position setting
          const adjacentRow = targetRow - dr;
          const adjacentCol = targetCol - dc;
          const mp2 = pieces.find(p => p.id === pieceId)!;
          mp2.row = adjacentRow;
          mp2.col = adjacentCol;
          // Move butterfly with attacker if shielded
          if (mp2.shieldedBy) {
            const butterfly = pieces.find(p => p.id === mp2.shieldedBy);
            if (butterfly) {
              butterfly.row = adjacentRow;
              butterfly.col = adjacentCol;
            }
          }
          targetSurvived = false; // Target (paralyzed piece) died, attacker already positioned
          paralyzedPieceKilled = true; // Flag to skip normal position setting
        }
      }
      else if (mp.type === 'bat') {
        if (top.type === 'butterfly') {
          const result = killPiece(pieces, top.id, mp);
          pieces = result.pieces;
          lastAction = result.action;
          const mp2 = pieces.find(p => p.id === pieceId)!;
          mp2.row = targetRow;
          mp2.col = targetCol;
          // If butterfly was shielding, bat lands and paralyzes the now-exposed piece
          if (shieldedPiece) {
            const exposed = pieces.find(p => p.id === shieldedPiece.id);
            if (exposed && !exposed.paralyzedBy) {
              exposed.isParalyzed = true;
              exposed.paralyzedBy = pieceId;
              mp2.paralyzing = exposed.id;
              lastAction = { key: 'action.batKillsButterfly', vars: { name: exposed.type } };
            }
          }
          targetSurvived = false;
        } else if (top.type !== 'bat' && !top.paralyzedBy) {
          const enemy = pieces.find(p => p.id === top.id)!;
          const bat = pieces.find(p => p.id === pieceId)!;
          enemy.isParalyzed = true;
          enemy.paralyzedBy = pieceId;
          bat.paralyzing = top.id;
          lastAction = { key: 'action.batParalyzes', vars: { name: top.type } };
          targetSurvived = false;
        }
      }
      // Butterfly shielding checks
      else if (butterflyShielding && shieldedPiece && canPieceKill(mp.type, shieldedPiece.type)) {
          // Attacker can kill the shielded piece (e.g. Elephant vs shielded Lion): butterfly dies, shielded survives, bounce
          const result = killPiece(pieces, top.id, mp);
          pieces = result.pieces;
          lastAction = result.action;
          targetSurvived = true;
      } else if (butterflyShielding) {
        // Other case: attacker could only kill butterfly
        const result = killPiece(pieces, top.id, mp);
        pieces = result.pieces;
        lastAction = result.action;
        targetSurvived = true;
      }
      // Normal combat
      else if (top.type === 'elephant' && top.hp > 1) {
        // Elephant has 2 HP: first hit from anyone (including Lion) damages only
        const elephant = pieces.find(p => p.id === top.id)!;
        elephant.hp -= 1;
        elephant.isDamaged = true;
        lastAction = { key: 'action.elephantDamaged' };
        targetSurvived = true;
      } else {
        const result = killPiece(pieces, top.id, mp);
        pieces = result.pieces;
        lastAction = result.action;
        targetSurvived = false;
      }
    }

    // Only set position if we haven't already handled it (e.g., paralyzed piece kill, monkey vs bat)
    if (!paralyzedPieceKilled && !monkeyKilledBat) {
      if (targetSurvived) {
        const adjacentRow = targetRow - dr;
        const adjacentCol = targetCol - dc;
        const mp2 = pieces.find(p => p.id === pieceId)!;
        mp2.row = adjacentRow;
        mp2.col = adjacentCol;
        if (mp2.shieldedBy) {
          const butterfly = pieces.find(p => p.id === mp2.shieldedBy);
          if (butterfly) { butterfly.row = adjacentRow; butterfly.col = adjacentCol; }
        }
        bounceEffect = { pieceId, dr, dc };
      } else {
        const mp2 = pieces.find(p => p.id === pieceId)!;
        mp2.row = targetRow;
        mp2.col = targetCol;
        // Move butterfly with shielded piece when shielded piece is the one that moved (into combat)
        if (mp2.shieldedBy) {
          const butterfly = pieces.find(p => p.id === mp2.shieldedBy);
          if (butterfly) {
            butterfly.row = targetRow;
            butterfly.col = targetCol;
          }
        }
      }
    }
  }
  // ── Normal move to empty cell ─────────────────────────────────────────────
  else {
    const mp2 = pieces.find(p => p.id === pieceId)!;
    mp2.row = targetRow;
    mp2.col = targetCol;
    // Move butterfly with shielded piece
    if (mp2.shieldedBy) {
      const butterfly = pieces.find(p => p.id === mp2.shieldedBy);
      if (butterfly) {
        butterfly.row = targetRow;
        butterfly.col = targetCol;
      }
    }
  }

  // Per-piece elephant cooldown: 2 means "attacked this turn → skip next own turn's attacks".
  // The very turn the attack happened counts as 1 of the 2; decrementing on each own-turn-end
  // leaves cooldown=1 active during the next own turn (no attack), then 0 the turn after.
  if (piece.type === 'elephant' && enemyAtTarget) {
    const att = pieces.find(p => p.id === pieceId);
    if (att) att.cooldown = 2;
  }

  // ── Win condition: Lion on throne ─────────────────────────────────────────
  if (phase !== 'won') {
    const movedPiece = pieces.find(p => p.id === pieceId);
    if (movedPiece && piece.type === 'lion' && isThrone(movedPiece.row, movedPiece.col)) {
      winner = piece.player;
      phase = 'won';
      lastAction = { key: 'action.lionWinsThrone', vars: { n: piece.player } };
    }
  }

  // ── Win condition: all enemy lions eliminated ─────────────────────────────
  if (phase !== 'won') {
    const enemyPlayer: Player = piece.player === 1 ? 2 : 1;
    if (pieces.filter(p => p.player === enemyPlayer && p.type === 'lion').length === 0) {
      winner = piece.player;
      phase = 'won';
      lastAction = { key: 'action.lionWinsKill', vars: { n: piece.player } };
    }
  }

  // Ant: only one move per turn; after move, player can rotate then End Turn.
  // Turn does NOT end here — keep ant selected so player can rotate or End Turn.
  if (piece.type === 'ant' && phase !== 'won') {
    const movedAnt = pieces.find(p => p.id === pieceId)!;
    const { validRotations } = getValidMoves(movedAnt, pieces);
    const finalAction = lastAction ?? state.lastAction;
    const newTurn = state.turn + 1;
    // An "attack" is any move that resolved combat (kill OR damage). Once
    // it's flagged, clickCell must refuse every cell click so the player
    // can't snap back to undo a kill, nor switch to another piece. Only
    // rotation and End Turn remain (HUD-driven).
    const wasAttack = enemyAtTarget != null;
    return {
      ...state,
      pieces,
      currentPlayer: state.currentPlayer,
      selectedPieceId: pieceId,
      validMoves: [], // ant already moved once — no more moves this turn
      canRotate: validRotations.length > 0,
      validRotations,
      antHasRotated: false,
      antOriginalOrientation: state.antOriginalOrientation,
      antOriginalPosition: antOriginalPosition,
      antMovedThisTurn: true,
      antAttackedThisTurn: wasAttack,
      bounceEffect,
      phase,
      winner,
      turn: newTurn,
      lastAction: finalAction,
      history: pushHistory(state, pieces, state.currentPlayer, finalAction, newTurn),
      viewingHistoryIndex: null,
    };
  }

  // Turn ends: decrement cooldowns for the just-acted player's elephants.
  pieces = pieces.map(p =>
    p.player === piece.player && (p.cooldown ?? 0) > 0
      ? { ...p, cooldown: (p.cooldown ?? 0) - 1 }
      : p
  );

  const newPlayer = phase === 'won' ? state.currentPlayer : (state.currentPlayer === 1 ? 2 : 1);
  const finalAction = lastAction || state.lastAction;
  const newTurn = state.turn + 1;

  // Only tick the clock when the turn actually flips (a winning move
  // doesn't flip the player, and the loser's clock should freeze where
  // it is — they got the win first; time-out trumps).
  const tick = phase === 'won' ? null : tickClockOnTurnFlip(state, state.currentPlayer);
  const candidate: GameState = {
    ...state,
    pieces,
    currentPlayer: newPlayer,
    selectedPieceId: null,
    validMoves: [],
    canRotate: false,
    validRotations: [],
    antHasRotated: false,
    antOriginalOrientation: undefined,
    antOriginalPosition: undefined,
    antMovedThisTurn: false,
    antAttackedThisTurn: false,
    bounceEffect,
    phase,
    winner,
    turn: newTurn,
    lastAction: finalAction,
    history: pushHistory(state, pieces, newPlayer, finalAction, newTurn),
    viewingHistoryIndex: null,
  };
  return applyClockTick(candidate, tick);
}

// ─── Kill helper ──────────────────────────────────────────────────────────────

function killPiece(
  pieces: GamePiece[],
  targetId: string,
  attacker: GamePiece
): { pieces: GamePiece[]; action: ActionMessage } {
  const target = pieces.find(p => p.id === targetId);
  if (!target) return { pieces, action: { key: '' } };

  // Clean up shield/paralyze links
  if (target.shieldedBy) {
    const s = pieces.find(p => p.id === target.shieldedBy);
    if (s) { s.shielding = undefined; s.row = target.row; s.col = target.col; }
  }
  if (target.shielding) {
    const s = pieces.find(p => p.id === target.shielding);
    if (s) s.shieldedBy = undefined;
  }
  if (target.paralyzedBy) {
    const s = pieces.find(p => p.id === target.paralyzedBy);
    if (s) s.paralyzing = undefined;
  }
  if (target.paralyzing) {
    const s = pieces.find(p => p.id === target.paralyzing);
    if (s) { s.isParalyzed = false; s.paralyzedBy = undefined; }
  }

  return {
    pieces: pieces.filter(p => p.id !== targetId),
    action: { key: 'action.eliminated', vars: { targetName: target.type, attackerName: attacker.type } },
  };
}

// ─── End Turn (ant: rotation-only or after move) ──────────────────────────────

export function applyEndTurn(state: GameState): GameState {
  // Decrement cooldowns for the player who is ending their turn.
  const pieces = state.pieces.map(p =>
    p.player === state.currentPlayer && (p.cooldown ?? 0) > 0
      ? { ...p, cooldown: (p.cooldown ?? 0) - 1 }
      : p
  );
  const newPlayer: Player = state.currentPlayer === 1 ? 2 : 1;
  const newTurn = state.turn + 1;
  const lastAction = state.antMovedThisTurn ? { key: 'action.turnEnded' } : { key: 'action.antRotated' };
  const tick = tickClockOnTurnFlip(state, state.currentPlayer);
  const candidate: GameState = {
    ...state,
    pieces,
    currentPlayer: newPlayer,
    selectedPieceId: null,
    validMoves: [],
    canRotate: false,
    validRotations: [],
    antHasRotated: false,
    antOriginalOrientation: undefined,
    antOriginalPosition: undefined,
    antMovedThisTurn: false,
    antAttackedThisTurn: false,
    history: pushHistory(state, pieces, newPlayer, lastAction, newTurn),
    viewingHistoryIndex: null,
    turn: newTurn,
    lastAction,
  };
  return applyClockTick(candidate, tick);
}

// ─── Force-timeout (called from the HUD tick when the active player's
// clock visibly hits 0 without them having made a move). Returns a
// candidate next state with phase='won' for the OTHER player. The hook
// passes this through saveGameState for online games.
export function applyTimeout(state: GameState, losingPlayer: Player): GameState {
  if (state.phase !== 'playing') return state;
  const winner: Player = losingPlayer === 1 ? 2 : 1;
  return {
    ...state,
    phase: 'won',
    winner,
    lastAction: { key: 'action.timeout', vars: { n: winner } },
    clocks: state.clocks
      ? {
          ...state.clocks,
          [losingPlayer === 1 ? 'p1Seconds' : 'p2Seconds']: 0,
        } as Clocks
      : state.clocks,
  };
}
