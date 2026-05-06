// Local AI for vs-bot games. Three difficulty levels, all driven by the
// same legal-move generator the human player uses, so anything the bot
// plays is by construction a real, in-rules move.
//
//   • butterfly (easy)   = uniform random legal move
//   • monkey (medium)    = depth-1 minimax (1-ply greedy heuristic)
//   • lion (hard)        = depth-2 alpha-beta minimax with move ordering
//
// The AI is always player 2 — the human plays as player 1 (bottom of the
// board, moves first). Selection / valid-move flags on GameState are
// cleared between moves by the existing applyMove flow; the AI doesn't
// touch them.
//
// Heuristic priorities (in decreasing weight):
//   1. WIN STATES — capturing both enemy lions or moving own lion to
//      the throne returns ±1,000,000.
//   2. LION → THRONE — every step closer my lion gets is +8 points
//      (and symmetric for the opponent). The most valuable single piece
//      and the only one that wins the game by movement, so this term
//      dominates positional play.
//   3. MATERIAL — captures matter. Damaged elephants and paralysed
//      pieces are penalised.
//   4. PIECE ADVANCEMENT — non-lion pieces gain a small bonus for being
//      out of the back rank, encouraging aggression. Without this term,
//      non-capture moves all score equal and the AI looks random.

import type {
  GameState, GamePiece, Player, PieceType, Position, Orientation, AiLevel,
} from './types';
import { applyMove, applyEndTurn, getValidMoves } from './logic';

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

/** Zero-sum evaluation from `player`'s POV. Positive = good for player. */
function evaluate(state: GameState, player: Player): number {
  if (state.phase === 'won') {
    if (state.winner === player) return 1_000_000;
    if (state.winner != null) return -1_000_000;
  }

  let score = 0;

  // 1. Material (captures + status penalties)
  for (const p of state.pieces) {
    let v = PIECE_VALUE[p.type];
    if (p.isDamaged) v -= 6;        // damaged elephant worth less
    if (p.isParalyzed) v -= 4;      // paralyzed pieces are temporarily useless
    score += p.player === player ? v : -v;
  }

  // 2. Lion proximity to throne — the dominant positional term. Distance
  //    ranges 0..16 (max board distance). At weight 8 per step, a lion
  //    that has crossed half the board scores ~64 — comfortably more
  //    than any non-lion piece value. This is what makes the bot
  //    actually walk a lion toward the throne every turn it can.
  for (const p of state.pieces) {
    if (p.type !== 'lion') continue;
    const dist = distanceToThrone(p.row, p.col);
    const prox = Math.max(0, 16 - dist) * 8;
    score += p.player === player ? prox : -prox;
  }

  // 3. General piece advancement — non-lion pieces gain a small bonus
  //    for being further from their own back rank. Without this, a
  //    move like "bat slides one step diagonal" produces the same eval
  //    as "bat stays put" (no material change), and the AI ends up
  //    picking arbitrarily among ties — i.e. "random". Even a tiny
  //    weight (0.6 per step, capped) breaks those ties consistently
  //    in favour of forward play.
  for (const p of state.pieces) {
    if (p.type === 'lion') continue;
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
 *  perspective for `evaluate` (always our bot). Move ordering by 1-ply
 *  heuristic at each node makes the pruning much more effective.
 *  Returns the evaluated value of the position from `aiPlayer`'s POV. */
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

  // Order moves by quick 1-ply eval so the best-looking moves get
  // explored first — that's where alpha-beta gets most of its pruning.
  const scored = moves.map(m => {
    const after = simulate(state, m);
    return { after, h: evaluate(after, me) };
  });
  scored.sort((a, b) => b.h - a.h);

  const isMaxNode = me === aiPlayer;
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
    case 'monkey':    return pickBest(state, player, 1);
    case 'lion':      return pickBest(state, player, 2);
  }
}

/** Display labels — used by the HUD / start screen. Kept here so the
 *  difficulty list lives next to the AI logic itself. */
export const AI_LEVEL_META: Record<AiLevel, { emoji: string; label: string }> = {
  butterfly: { emoji: '🦋', label: 'Easy' },
  monkey:    { emoji: '🐒', label: 'Medium' },
  lion:      { emoji: '🦁', label: 'Hard' },
};
