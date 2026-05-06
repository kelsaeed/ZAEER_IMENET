// Local AI for vs-bot games. Three difficulty levels, all driven by the
// same legal-move generator the human player uses, so anything the bot
// plays is by construction a real, in-rules move.
//
//   • butterfly (easy)   = depth-1 minimax with eval noise — same eval as
//                          the harder bots so it still defends its lion
//                          and tries to kill yours, but the noise produces
//                          frequent, beatable mistakes.
//   • monkey (medium)    = depth-3 alpha-beta — solid tactical play with
//                          no fancy heuristics. Will punish blunders.
//   • lion (hard)        = iterative deepening up to depth 5 with a
//                          ~1.5 s time budget, plus a small transposition
//                          cache. Sees the lion-throne race outcome and
//                          plays defensively when it's losing the race.
//
// The AI is always player 2 — the human plays as player 1 (bottom of the
// board, moves first).
//
// Heuristic priorities (decreasing weight):
//   1. WIN STATES                 ±1,000,000
//   2. LION RACE (tempo-aware)    ±~600 — projects the eventual race
//      winner from each leaf state. Without this term the eval is
//      symmetric under "both race" and the AI happily races itself
//      into a guaranteed loss.
//   3. LION CHECK / THREAT        ±~250 per attacker
//   4. MATERIAL                    8..18 per piece
//   5. BLOCKING / ADVANCEMENT      small structural terms

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

/** Project the lion-throne race outcome from this state and turn it into
 *  a positive number for the side that will reach the throne first.
 *
 *  This is THE term that fixes "AI races into a guaranteed loss". Without
 *  it, the eval is symmetric under both lions advancing — both gain prox,
 *  both gain advance, eval ≈ 0 — so the AI doesn't see that whoever moves
 *  first will reach first. With it, the side losing the race takes a
 *  big constant penalty regardless of how the search horizon falls.
 *
 *  We compute each lion's "ply-of-arrival": with alternating moves, the
 *  side to move needs (2·dist − 1) plies to land on the throne; the side
 *  not to move needs (2·dist) plies. Margin = enemy_plies − my_plies
 *  (positive → I win by `margin` plies). A 1-ply margin is a tempo edge,
 *  not a hard win, so the per-ply weight is moderate; cumulative across
 *  several plies it dominates raw throne-prox.
 */
function raceTempo(state: GameState, player: Player, myLion: GamePiece | undefined, enemyLion: GamePiece | undefined): number {
  if (!myLion || !enemyLion) return 0;
  // Paralysed lion loses a tempo — model as an extra unit of distance so
  // the race math reflects the skipped turn.
  const myDist = distanceToThrone(myLion.row, myLion.col) + (myLion.isParalyzed ? 1 : 0);
  const enemyDist = distanceToThrone(enemyLion.row, enemyLion.col) + (enemyLion.isParalyzed ? 1 : 0);
  const meToMove = state.currentPlayer === player;
  const myPlies    = 2 * myDist    - (meToMove ? 1 : 0);
  const enemyPlies = 2 * enemyDist - (meToMove ? 0 : 1);
  const margin = enemyPlies - myPlies;
  return margin * 30;
}

/** Sum of "how scary is each enemy piece, weighted by closeness, against
 *  this lion". Used to penalise own-lion exposure and reward attacks on
 *  enemy lion. The weight tiers are calibrated so a single adjacent
 *  attacker (~80 pts) outweighs every other positional term combined. */
function lionThreatScore(state: GameState, lion: GamePiece, attackerPlayer: Player): number {
  let threat = 0;
  for (const p of state.pieces) {
    if (p.player !== attackerPlayer) continue;
    if (p.isParalyzed) continue;
    if (p.id === lion.id) continue;
    const dist = chebyshev(p, lion);
    if (dist === 0) continue;

    let weight = 0;
    if (canPieceKill(p.type, 'lion')) {
      // Lion / elephant can kill the lion outright via the kill cycle.
      // Elephants on cooldown are still positional threats but can't strike.
      const cooldownPenalty = (p.type === 'elephant' && (p.cooldown ?? 0) > 0) ? 0.4 : 1.0;
      weight = 9 * cooldownPenalty;
    }
    // A bat near an unparalysed lion is huge — paralysed lion can't run.
    if (p.type === 'bat' && !lion.isParalyzed) {
      weight = Math.max(weight, 6);
    }
    // Any other piece blocks the lion's path or trades tempo nearby.
    if (weight === 0 && dist <= 3) weight = 1.2;

    if (weight === 0) continue;
    // Closer is much scarier. At dist=1 ≈ 9*weight, dist=8 ≈ 2*weight.
    const closeness = Math.max(0, 10 - dist);
    threat += closeness * weight;
  }
  return threat;
}

/** "Lion in immediate danger" — extra big penalty if any enemy piece is
 *  adjacent to my lion AND can actually kill it (kill cycle + not on
 *  cooldown). The threat term covers smooth pressure; this term covers
 *  the discrete "if I do nothing my lion dies next ply" case. */
function immediateDangerScore(state: GameState, lion: GamePiece, attackerPlayer: Player): number {
  if (lion.shieldedBy) return 0; // a butterfly will eat the first hit
  let danger = 0;
  for (const p of state.pieces) {
    if (p.player !== attackerPlayer) continue;
    if (p.isParalyzed) continue;
    const dist = chebyshev(p, lion);
    if (dist > 1) continue;
    if (canPieceKill(p.type, 'lion')) {
      if (p.type === 'elephant' && (p.cooldown ?? 0) > 0) continue;
      danger += 250;
    }
    if (p.type === 'bat' && !lion.isParalyzed) {
      danger += 120; // paralyse is 1 ply away from the kill stack
    }
  }
  return danger;
}

/** Bonus for sitting on a square between the enemy lion and the throne.
 *  Encourages the AI to actually block the path instead of letting the
 *  enemy lion stroll in unopposed. */
function blockingBonus(state: GameState, lion: GamePiece, blockerPlayer: Player): number {
  let bonus = 0;
  const centre = { row: 7.5, col: 7.5 };
  for (const p of state.pieces) {
    if (p.player !== blockerPlayer) continue;
    if (p.isParalyzed) continue;
    if (p.type === 'lion') continue;
    const minR = Math.min(lion.row, centre.row);
    const maxR = Math.max(lion.row, centre.row);
    const minC = Math.min(lion.col, centre.col);
    const maxC = Math.max(lion.col, centre.col);
    if (p.row < minR - 1 || p.row > maxR + 1) continue;
    if (p.col < minC - 1 || p.col > maxC + 1) continue;
    const distToThrone = distanceToThrone(p.row, p.col);
    bonus += Math.max(0, 8 - distToThrone) * 1.8;
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
    if (p.isDamaged) v -= 6;
    if (p.isParalyzed) v -= 4;
    if (p.type === 'elephant' && (p.cooldown ?? 0) > 0) v -= 2;
    score += p.player === player ? v : -v;
  }

  const myLion = state.pieces.find(p => p.player === player && p.type === 'lion');
  const enemyLion = state.pieces.find(p => p.player === enemyPlayer && p.type === 'lion');

  // 2. Race tempo — projects the eventual race winner. Heavy weight so
  //    the AI prefers BLOCKING / ATTACKING the enemy lion when it would
  //    otherwise lose the race rather than racing alongside.
  score += raceTempo(state, player, myLion, enemyLion);

  // 3. Lion proximity to throne — incremental, reinforces the race term.
  if (myLion) {
    score += Math.max(0, 16 - distanceToThrone(myLion.row, myLion.col)) * 8;
  }
  if (enemyLion) {
    score -= Math.max(0, 16 - distanceToThrone(enemyLion.row, enemyLion.col)) * 8;
  }

  // 4. Lion threat & immediate danger
  if (myLion) {
    score -= lionThreatScore(state, myLion, enemyPlayer);
    score -= immediateDangerScore(state, myLion, enemyPlayer);
  }
  if (enemyLion) {
    score += lionThreatScore(state, enemyLion, player);
    score += immediateDangerScore(state, enemyLion, player);
  }

  // 5. Blocking — bonus for own pieces sitting between enemy lion + throne
  if (enemyLion) score += blockingBonus(state, enemyLion, player);
  if (myLion) score -= blockingBonus(state, myLion, enemyPlayer);

  // 6. Piece advancement — encourages aggression with non-lion pieces.
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

/** Search context. Carries the deadline (for hard's iterative deepening)
 *  and an optional eval-noise band (for easy mode's controlled blunders). */
interface SearchCtx {
  aiPlayer: Player;
  deadline: number; // performance.now() ms — once exceeded the search bails
  /** ±this number is added to each leaf eval. 0 disables noise. */
  noise: number;
  /** Set to true if the search aborted early due to the deadline. The
   *  caller should fall back to the previous iteration's result. */
  aborted: boolean;
}

function noisyEval(state: GameState, ctx: SearchCtx): number {
  const v = evaluate(state, ctx.aiPlayer);
  if (ctx.noise === 0) return v;
  return v + (Math.random() - 0.5) * 2 * ctx.noise;
}

function search(state: GameState, depth: number, alpha: number, beta: number, ctx: SearchCtx): number {
  if (ctx.aborted) return 0;
  // Cheap deadline check — only every 256 calls would be cheaper, but
  // performance.now() is fast and the budget is generous.
  if (performance.now() > ctx.deadline) {
    ctx.aborted = true;
    return 0;
  }
  if (depth === 0 || state.phase === 'won') {
    return noisyEval(state, ctx);
  }
  const me = state.currentPlayer;
  const moves = listLegalMoves(state, me);
  if (moves.length === 0) return noisyEval(state, ctx);

  const isMaxNode = me === ctx.aiPlayer;

  // Leaf level: every recursion just returns evaluate(after). Inline it to
  // avoid the sort+recurse round trip — the difference between depth-3+
  // search being interactive and locking the page.
  if (depth === 1) {
    if (isMaxNode) {
      let best = -Infinity;
      for (const m of moves) {
        const after = simulate(state, m);
        const v = noisyEval(after, ctx);
        if (v > best) best = v;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    }
    let best = Infinity;
    for (const m of moves) {
      const after = simulate(state, m);
      const v = noisyEval(after, ctx);
      if (v < best) best = v;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Inner node: order children by a CHEAP static heuristic (no
  // simulation), keep the top-K, and recurse only on those. The previous
  // version simulated + evaluated every move just to sort — that's
  // O(B·eval_cost) per node and made depth-3+ unreachable inside the
  // budget. Static ordering captures the only moves we actually care
  // about for ordering: captures first, then lion-towards-throne, then
  // pieces-towards-enemy-lion.
  const ordered = orderMovesStatically(state, moves, ctx.aiPlayer, isMaxNode);
  const candidates = ordered.length > INNER_BRANCH_CAP ? ordered.slice(0, INNER_BRANCH_CAP) : ordered;

  if (isMaxNode) {
    let best = -Infinity;
    for (const m of candidates) {
      const after = simulate(state, m);
      const v = search(after, depth - 1, alpha, beta, ctx);
      if (ctx.aborted) return best === -Infinity ? 0 : best;
      if (v > best) best = v;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of candidates) {
      const after = simulate(state, m);
      const v = search(after, depth - 1, alpha, beta, ctx);
      if (ctx.aborted) return best === Infinity ? 0 : best;
      if (v < best) best = v;
      if (best < beta) beta = best;
      if (alpha >= beta) break;
    }
    return best;
  }
}

/** Top-K moves to recurse on at inner nodes. The root sees ALL moves so a
 *  surprising-but-strong move can still be selected; only deeper exploration
 *  is pruned. Calibrated so depth-3 search typically completes inside the
 *  hard-mode 1.5 s budget on a mid-range laptop. */
const INNER_BRANCH_CAP = 12;

/** Static move-ordering heuristic. No simulation — just pick the obvious
 *  reasons a move might be strong: captures first, then lion-toward-throne,
 *  then aggression toward the enemy lion. Higher score = explore first. */
function orderMovesStatically(state: GameState, moves: Candidate[], aiPlayer: Player, isMaxNode: boolean): Candidate[] {
  const enemyPlayer: Player = aiPlayer === 1 ? 2 : 1;
  const enemyLion = state.pieces.find(p => p.player === enemyPlayer && p.type === 'lion');
  const myLion = state.pieces.find(p => p.player === aiPlayer && p.type === 'lion');
  const lionToThreat = isMaxNode ? enemyLion : myLion;
  const scored = moves.map(m => {
    let s = 0;
    const t = m.target;
    // Capture? Cheap O(P) scan; we don't care about overlay subtleties for
    // ordering, just whether an enemy occupies the target cell at all.
    const target = state.pieces.find(p => p.row === t.row && p.col === t.col && p.player !== m.piece.player);
    if (target) s += PIECE_VALUE[target.type] * 10;
    // Own lion advancing toward the throne.
    if (m.piece.type === 'lion') {
      const oldD = distanceToThrone(m.piece.row, m.piece.col);
      const newD = distanceToThrone(t.row, t.col);
      s += (oldD - newD) * 25;
    }
    // Pieces moving closer to the lion they should be threatening.
    if (lionToThreat) {
      const oldD = chebyshev(m.piece, lionToThreat);
      const newD = chebyshev(t, lionToThreat);
      if (newD < oldD) s += (oldD - newD) * 4;
    }
    return { m, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.map(x => x.m);
}

// ─── Root selection ──────────────────────────────────────────────────────────

/** Choose the best move at fixed `depth`, returning candidates tied at the
 *  best score (the caller then picks one — usually randomly to avoid the
 *  AI replaying the same opening verbatim every time). Honours the search
 *  context's deadline; if the deadline kicks in mid-iteration the caller
 *  should fall back to the previous depth's result. */
function rankAtDepth(state: GameState, depth: number, ctx: SearchCtx): {
  best: Candidate[]; bestScore: number; aborted: boolean;
} | null {
  const moves = listLegalMoves(state, ctx.aiPlayer);
  if (moves.length === 0) return null;

  // Pre-sort by 1-ply eval so a quick win is found early. With the deadline,
  // it also means if we abort mid-iteration, the partial result is biased
  // toward strong moves.
  const scored = moves.map(c => {
    const after = simulate(state, c);
    return { c, after, h: evaluate(after, ctx.aiPlayer) };
  });
  scored.sort((a, b) => b.h - a.h);

  let bestScore = -Infinity;
  let best: Candidate[] = [];
  for (const { c, after } of scored) {
    const score = depth <= 1
      ? noisyEval(after, ctx)
      : search(after, depth - 1, -Infinity, Infinity, ctx);
    if (ctx.aborted) {
      // Partial result — bail and let the caller fall back.
      return { best, bestScore, aborted: true };
    }
    if (score > bestScore) { bestScore = score; best = [c]; }
    else if (score === bestScore) best.push(c);
  }
  return { best, bestScore, aborted: false };
}

/** Iterative deepening — search at depth 1, 2, 3, ... until either we hit
 *  `maxDepth` or the per-iteration time check decides the next iteration
 *  will likely overrun. Always returns the best move from the deepest
 *  COMPLETED iteration, never a partial one. */
function pickByIterativeDeepening(state: GameState, ctx: SearchCtx, maxDepth: number): AiMove | null {
  const start = performance.now();
  let last: { best: Candidate[]; bestScore: number } | null = null;

  for (let d = 1; d <= maxDepth; d++) {
    const result = rankAtDepth(state, d, ctx);
    if (!result) return null;
    if (result.aborted) {
      // Discard partial — keep the previous fully-completed iteration.
      break;
    }
    last = { best: result.best, bestScore: result.bestScore };
    // Decide whether to even attempt the next depth. Each ply roughly
    // 5×s the work after pruning; if we've used >25% of the budget
    // already, the next iteration is very likely to overrun. Going
    // deeper-and-aborting is worse than stopping cleanly because the
    // partial result is discarded.
    const elapsed = performance.now() - start;
    const totalBudget = ctx.deadline - start;
    if (elapsed > totalBudget * 0.25) break;
    // Saw a forced win/loss — no point searching deeper.
    if (Math.abs(result.bestScore) > 500_000) break;
  }

  if (!last || last.best.length === 0) return null;
  const pick = last.best[Math.floor(Math.random() * last.best.length)];
  return {
    pieceId: pick.piece.id,
    target: pick.target,
    rotateTo: pickAntRotation(state, pick, ctx.aiPlayer),
  };
}

// ─── Ant rotation ────────────────────────────────────────────────────────────

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

  // All three levels run the same search machinery and the same eval, so
  // every level defends its lion, pressures yours, and races to the throne
  // — the differences are search depth, budget, and how much random noise
  // is mixed into leaf evals.
  //
  //   • Easy    — depth 1 only, ±80 noise. Picks reasonable moves on
  //               average but blunders often enough that an attentive
  //               human wins comfortably.
  //   • Medium  — depth 2, no noise. Sees one opponent reply.
  //               Beats casual play, doesn't see deep tactics.
  //   • Hard    — iterative deepening up to depth 5 within 1.8 s. In
  //               practice completes depth 3 most turns; the race-tempo
  //               eval makes depth 3 here much stronger than the previous
  //               depth-3 build, since the AI now knows it's losing the
  //               race when it is and reacts defensively.
  const baseCtx = { aiPlayer: player, aborted: false };
  switch (level) {
    case 'butterfly': {
      const ctx: SearchCtx = { ...baseCtx, deadline: performance.now() + 250, noise: 80 };
      return pickByIterativeDeepening(state, ctx, 1);
    }
    case 'monkey': {
      const ctx: SearchCtx = { ...baseCtx, deadline: performance.now() + 600, noise: 0 };
      return pickByIterativeDeepening(state, ctx, 2);
    }
    case 'lion': {
      const ctx: SearchCtx = { ...baseCtx, deadline: performance.now() + 1800, noise: 0 };
      return pickByIterativeDeepening(state, ctx, 5);
    }
  }
}

/** Display labels — used by the HUD / start screen. Kept here so the
 *  difficulty list lives next to the AI logic itself. */
export const AI_LEVEL_META: Record<AiLevel, { emoji: string; label: string }> = {
  butterfly: { emoji: '🦋', label: 'Easy' },
  monkey:    { emoji: '🐒', label: 'Medium' },
  lion:      { emoji: '🦁', label: 'Hard' },
};
