// Local AI for vs-bot games. Three difficulty levels, all driven by the
// same legal-move generator the human player uses, so anything the bot
// plays is by construction a real, in-rules move.
//
//   • butterfly (easy)   = uniform random legal move
//   • monkey (medium)    = depth-2 alpha-beta minimax (sees opponent reply)
//   • lion (hard)        = depth-3 alpha-beta minimax with move ordering
//
// The AI is always player 2 — the human plays as player 1 (bottom of the
// board, moves first). Selection / valid-move flags on GameState are
// cleared between moves by the existing applyMove flow; the AI doesn't
// touch them.
//
// Heuristic priorities (in decreasing weight):
//   1. WIN STATES — capturing both enemy lions or moving own lion to
//      the throne returns ±1,000,000.
//   2. LION THREAT — pieces that can kill or paralyze a lion get a big
//      bonus inversely proportional to their distance to it. Symmetric
//      penalty for enemy threats against my lion. This is what makes
//      the AI defend its lion and pressure the enemy lion instead of
//      blindly racing to the throne.
//   3. LION → THRONE — proximity bonus per lion. Both sides get the
//      same per-step bonus, so the eval is invariant under "both race"
//      — the threat term breaks the symmetry.
//   4. MATERIAL — captures matter. Damaged elephants, paralysed
//      pieces, and elephants on cooldown are penalised.
//   5. PIECE ADVANCEMENT & ACTIVITY — non-lion pieces gain a small
//      bonus for advancing / having legal moves (no piece sitting
//      idle while the lion gets walked into trouble).

import type {
  GameState, GamePiece, Player, PieceType, Position, Orientation, AiLevel,
} from './types';
import { applyMove, applyEndTurn, getValidMoves } from './logic';
import { canPieceKill } from './constants';

export interface AiMove {
  pieceId: string;
  target: Position;
  /** For ants: rotate to this orientation after moving (optional). */
  rotateTo?: Orientation;
}

// ─── Heuristic ───────────────────────────────────────────────────────────────

const PIECE_VALUE: Record<PieceType, number> = {
  // Losing the lion ends the game, so its weight dominates everything else.
  lion: 10000,
  // Elephant is strong (slides far, 2 HP) — most valuable non-king.
  elephant: 18,
  ant: 12,
  monkey: 9,
  bat: 9,
  butterfly: 7,
};

/** Manhattan-ish distance from (row, col) to the nearest throne cell.
 *  The throne is the 2×2 block at rows 7–8, cols 7–8. Lions on the
 *  throne win the game, so the closer a lion is, the better. */
function distanceToThrone(row: number, col: number): number {
  const dr = row < 7 ? 7 - row : row > 8 ? row - 8 : 0;
  const dc = col < 7 ? 7 - col : col > 8 ? col - 8 : 0;
  return dr + dc;
}

/** Chebyshev (king-move) distance — captures the "how close to threaten"
 *  metric better than Manhattan, since most attackers are diagonal-or-
 *  orthogonal and a piece at (r±1, c±1) is just one move away. */
function chebyshev(a: { row: number; col: number }, b: { row: number; col: number }): number {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

/** Sum of "how scary is each enemy piece, weighted by closeness, against
 *  this lion". Used to penalise own-lion exposure and reward attacks on
 *  enemy lion. The weight tiers are calibrated so a single adjacent
 *  attacker (~50 pts) outweighs every other positional term combined. */
function lionThreatScore(state: GameState, lion: GamePiece, attackerPlayer: Player): number {
  let threat = 0;
  for (const p of state.pieces) {
    if (p.player !== attackerPlayer) continue;
    if (p.isParalyzed) continue;
    if (p.id === lion.id) continue;
    const dist = chebyshev(p, lion);
    if (dist === 0) continue;

    let weight = 0;
    // Lion / elephant can kill the lion outright via the kill cycle.
    // Elephants on cooldown are still positional threats but can't strike.
    if (canPieceKill(p.type, 'lion')) {
      const cooldownPenalty = (p.type === 'elephant' && (p.cooldown ?? 0) > 0) ? 0.4 : 1.0;
      weight = 7 * cooldownPenalty;
    }
    // A bat near an unparalysed lion is huge — paralysed lion can't run.
    if (p.type === 'bat' && !lion.isParalyzed) {
      weight = Math.max(weight, 5);
    }
    // Any other piece blocks the lion's path or trades tempo nearby.
    if (weight === 0 && dist <= 3) weight = 1;

    if (weight === 0) continue;
    // Closer is much scarier. At dist=1 we get ≈ 9*weight, dist=8 ≈ 2*weight.
    const closeness = Math.max(0, 10 - dist);
    threat += closeness * weight;
  }
  return threat;
}

/** Bonus for sitting on a square between the enemy lion and the throne.
 *  Encourages the AI to actually block the path instead of letting the
 *  enemy lion stroll in unopposed. Cheap/fast: just a "between" check
 *  on rows + columns, then a small bonus weighted by closeness to throne. */
function blockingBonus(state: GameState, lion: GamePiece, blockerPlayer: Player): number {
  let bonus = 0;
  // The throne is the 2x2 block at rows 7-8, cols 7-8. Approximate centre
  // for "betweenness" checks.
  const centre = { row: 7.5, col: 7.5 };
  for (const p of state.pieces) {
    if (p.player !== blockerPlayer) continue;
    if (p.isParalyzed) continue;
    if (p.type === 'lion') continue; // own lion is racing, not blocking
    // Is this piece between the enemy lion and the throne, row-wise?
    const minR = Math.min(lion.row, centre.row);
    const maxR = Math.max(lion.row, centre.row);
    const minC = Math.min(lion.col, centre.col);
    const maxC = Math.max(lion.col, centre.col);
    if (p.row < minR - 1 || p.row > maxR + 1) continue;
    if (p.col < minC - 1 || p.col > maxC + 1) continue;
    // Closer to throne = better block.
    const distToThrone = distanceToThrone(p.row, p.col);
    bonus += Math.max(0, 8 - distToThrone) * 1.5;
  }
  return bonus;
}

/** Zero-sum evaluation from `player`'s POV. Positive = good for player. */
function evaluate(state: GameState, player: Player): number {
  if (state.phase === 'won') {
    if (state.winner === player) return 1_000_000;
    if (state.winner != null) return -1_000_000;
  }

  let score = 0;
  const enemyPlayer: Player = player === 1 ? 2 : 1;

  // 1. Material (captures + status penalties)
  for (const p of state.pieces) {
    let v = PIECE_VALUE[p.type];
    if (p.isDamaged) v -= 6;        // damaged elephant worth less
    if (p.isParalyzed) v -= 4;      // paralyzed pieces are temporarily useless
    if (p.type === 'elephant' && (p.cooldown ?? 0) > 0) v -= 2; // can't attack this turn
    score += p.player === player ? v : -v;
  }

  // Identify lions for threat/race terms.
  const myLion = state.pieces.find(p => p.player === player && p.type === 'lion');
  const enemyLion = state.pieces.find(p => p.player === enemyPlayer && p.type === 'lion');

  // 2. Lion proximity to throne — the dominant positional term for each
  //    lion. Distance ranges 0..16. At weight 8 per step, a lion that has
  //    crossed half the board scores ~64 — comfortably more than any
  //    non-lion piece value.
  if (myLion) {
    const prox = Math.max(0, 16 - distanceToThrone(myLion.row, myLion.col)) * 8;
    score += prox;
  }
  if (enemyLion) {
    const prox = Math.max(0, 16 - distanceToThrone(enemyLion.row, enemyLion.col)) * 8;
    score -= prox;
  }

  // 3. Lion threat — the term that breaks racing symmetry. If the enemy
  //    has pieces near my lion that could kill or paralyse it, that's
  //    very bad. If I have pieces near the enemy lion, very good. Weight
  //    is high enough to dominate raw lion-throne proximity for short
  //    distances, so the AI prefers attacking the runaway enemy lion
  //    over racing alongside it.
  if (myLion) score -= lionThreatScore(state, myLion, enemyPlayer);
  if (enemyLion) score += lionThreatScore(state, enemyLion, player);

  // 4. Blocking — bonus for own pieces sitting between the enemy lion
  //    and the throne. Stops the AI from leaving the lane wide open.
  if (enemyLion) score += blockingBonus(state, enemyLion, player);
  if (myLion) score -= blockingBonus(state, myLion, enemyPlayer);

  // 5. General piece advancement — non-lion pieces gain a small bonus
  //    for being further from their own back rank. Without this term,
  //    non-capture moves all score equal and the AI ends up picking
  //    arbitrarily among ties (looks "random"). Paralysed pieces don't
  //    earn the bonus so the AI doesn't reward leaving a paralysed
  //    piece dangling deep on the board.
  for (const p of state.pieces) {
    if (p.type === 'lion') continue;
    if (p.isParalyzed) continue;
    const ownBackRow = p.player === 1 ? 15 : 0;
    const advancement = Math.min(8, Math.abs(p.row - ownBackRow));
    score += p.player === player ? advancement * 0.6 : -advancement * 0.6;
  }

  return score;
}

// ─── Move enumeration / simulation ───────────────────────────────────────────

interface Candidate {
  piece: GamePiece;
  target: Position;
}

function listLegalMoves(state: GameState, player: Player): Candidate[] {
  const out: Candidate[] = [];
  for (const piece of state.pieces) {
    if (piece.player !== player) continue;
    if (piece.isParalyzed) continue;
    const { moves } = getValidMoves(piece, state.pieces);
    for (const m of moves) out.push({ piece, target: m });
  }
  return out;
}

/** Apply the candidate's move and, if the move was an ant move (which
 *  doesn't end the turn on its own), follow up with applyEndTurn so the
 *  resulting state is what the opponent actually sees on their turn. */
function simulate(state: GameState, c: Candidate): GameState {
  let next = applyMove(state, c.piece.id, c.target.row, c.target.col);
  if (next.phase !== 'playing') return next;
  if (next.currentPlayer === state.currentPlayer && c.piece.type === 'ant') {
    next = applyEndTurn(next);
  }
  return next;
}

// ─── Search ──────────────────────────────────────────────────────────────────

/** Alpha-beta minimax. `depth` is plies remaining; `aiPlayer` is the
 *  perspective for `evaluate` (always our bot). At inner nodes we order
 *  children by a 1-ply heuristic so alpha-beta prunes effectively; at
 *  leaves we skip the sort and evaluate directly to keep depth-3 search
 *  feasible without a worker. Returns the evaluated value of the position
 *  from `aiPlayer`'s POV. */
function search(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  aiPlayer: Player,
): number {
  if (depth === 0 || state.phase === 'won') {
    return evaluate(state, aiPlayer);
  }
  const me = state.currentPlayer;
  const moves = listLegalMoves(state, me);
  if (moves.length === 0) return evaluate(state, aiPlayer);

  const isMaxNode = me === aiPlayer;

  // Leaf level: every recursion just returns evaluate(after). Computing
  // that inline (without a sort+recurse round trip) is the difference
  // between depth-3 hard mode being interactive and locking the page
  // for a few seconds.
  if (depth === 1) {
    if (isMaxNode) {
      let best = -Infinity;
      for (const m of moves) {
        const after = simulate(state, m);
        const v = evaluate(after, aiPlayer);
        if (v > best) best = v;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    }
    let best = Infinity;
    for (const m of moves) {
      const after = simulate(state, m);
      const v = evaluate(after, aiPlayer);
      if (v < best) best = v;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Inner node: order children by quick 1-ply eval so the best-looking
  // moves get explored first — that's where alpha-beta gets most of its
  // pruning power.
  const scored = moves.map(m => {
    const after = simulate(state, m);
    return { after, h: evaluate(after, me) };
  });
  // Min nodes want their best (lowest) child first; max nodes want highest first.
  scored.sort((a, b) => isMaxNode ? b.h - a.h : a.h - b.h);

  if (isMaxNode) {
    let best = -Infinity;
    for (const { after } of scored) {
      const v = search(after, depth - 1, alpha, beta, aiPlayer);
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const { after } of scored) {
      const v = search(after, depth - 1, alpha, beta, aiPlayer);
      if (v < best) best = v;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
    return best;
  }
}

/** Pick the candidate that maximises the search value. Ties are broken
 *  randomly so the bot doesn't replay the exact same move every time
 *  it sees the same position. */
function pickBest(state: GameState, player: Player, depth: number): AiMove | null {
  const moves = listLegalMoves(state, player);
  if (moves.length === 0) return null;

  // Pre-sort by 1-ply eval so a quick win is found early — useful when
  // depth=1 (the sort and the first eval are the same work) and harmless
  // when depth>1 (alpha-beta does its own ordering inside `search`).
  const scored = moves.map(c => {
    const after = simulate(state, c);
    return { c, after, h: evaluate(after, player) };
  });
  scored.sort((a, b) => b.h - a.h);

  let bestScore = -Infinity;
  let best: Candidate[] = [];
  for (const { c, after } of scored) {
    // For depth 1 we already have the eval (h is from `player`'s POV
    // *after* my move — which is the right thing because there's no
    // opponent reply to consider). For deeper search, recurse.
    const score = depth <= 1
      ? evaluate(after, player)
      : search(after, depth - 1, -Infinity, Infinity, player);
    if (score > bestScore) { bestScore = score; best = [c]; }
    else if (score === bestScore) best.push(c);
  }

  const pick = best[Math.floor(Math.random() * best.length)];
  return {
    pieceId: pick.piece.id,
    target: pick.target,
    rotateTo: pickAntRotation(state, pick, player),
  };
}

// ─── Per-level entry points ──────────────────────────────────────────────────

function pickRandom(state: GameState, player: Player): AiMove | null {
  const moves = listLegalMoves(state, player);
  if (moves.length === 0) return null;
  const c = moves[Math.floor(Math.random() * moves.length)];
  return { pieceId: c.piece.id, target: c.target, rotateTo: pickAntRotation(state, c, player) };
}

// ─── Ant rotation ────────────────────────────────────────────────────────────
// After an ant moves, it may rotate to one of the legal orientations. The
// chosen orientation changes which cells the wings occupy (and therefore
// blocks/exposes paths). We pick the orientation whose post-rotation
// position evaluates best for the AI. For 'butterfly' (random) we just
// keep the current orientation — a tiny bit of laziness is on-brand for
// the easy bot.

function pickAntRotation(state: GameState, c: Candidate, player: Player): Orientation | undefined {
  if (c.piece.type !== 'ant') return undefined;
  const afterMove = applyMove(state, c.piece.id, c.target.row, c.target.col);
  if (afterMove.phase === 'won') return undefined;
  const ant = afterMove.pieces.find(p => p.id === c.piece.id);
  if (!ant) return undefined;
  const validRotations = afterMove.validRotations ?? [];
  if (validRotations.length === 0) return undefined;

  let bestScore = evaluate(afterMove, player);
  let bestOri: Orientation | undefined;
  for (const ori of validRotations) {
    const rotated = afterMove.pieces.map(p => p.id === c.piece.id ? { ...p, orientation: ori } : p);
    const rotState: GameState = { ...afterMove, pieces: rotated };
    const score = evaluate(rotState, player);
    if (score > bestScore) { bestScore = score; bestOri = ori; }
  }
  return bestOri;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function chooseAiMove(state: GameState, player: Player, level: AiLevel): AiMove | null {
  if (state.phase !== 'playing') return null;
  if (state.currentPlayer !== player) return null;
  switch (level) {
    case 'butterfly': return pickRandom(state, player);
    case 'monkey':    return pickBest(state, player, 2);
    case 'lion':      return pickBest(state, player, 3);
  }
}

/** Display labels — used by the HUD / start screen. Kept here so the
 *  difficulty list lives next to the AI logic itself. */
export const AI_LEVEL_META: Record<AiLevel, { emoji: string; label: string }> = {
  butterfly: { emoji: '🦋', label: 'Easy' },
  monkey:    { emoji: '🐒', label: 'Medium' },
  lion:      { emoji: '🦁', label: 'Hard' },
};
