// Local AI for vs-bot games. Three difficulty levels, all driven by the
// same legal-move generator the human player uses, so anything the bot
// plays is by construction a real, in-rules move.
//
//   • butterfly (easy)   = uniform random legal move
//   • monkey (medium)    = 1-ply greedy: pick the move that maximises
//                          a simple material+position heuristic
//   • lion (hard)        = 2-ply minimax over the top candidates of the
//                          1-ply search, with the opponent assumed to
//                          play greedily in response.
//
// The AI is always player 2 — the human plays as player 1 (bottom of the
// board, moves first). Selection / valid-move flags on GameState are
// cleared between moves by the existing applyMove flow; the AI doesn't
// touch them.

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
  const opp: Player = player === 1 ? 2 : 1;
  let score = 0;
  for (const p of state.pieces) {
    let v = PIECE_VALUE[p.type];
    if (p.isDamaged) v -= 6;        // damaged elephant worth less
    if (p.isParalyzed) v -= 4;      // paralyzed pieces are temporarily useless
    if (p.player === player) score += v;
    else score -= v;
  }
  // Lion proximity to throne: each step closer is +1.2 (and symmetric for
  // the opponent's lion). 14 ≈ longest path either lion takes from start
  // so the bonus stays in the same ballpark as one minor piece.
  for (const lion of state.pieces) {
    if (lion.type !== 'lion') continue;
    const dist = distanceToThrone(lion.row, lion.col);
    const prox = Math.max(0, 14 - dist) * 1.2;
    if (lion.player === player) score += prox;
    else score -= prox;
  }
  return score;
}

// ─── Move enumeration ────────────────────────────────────────────────────────

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
 *  resulting state is what the opponent actually sees on their turn. This
 *  is what we want for evaluation. */
function simulate(state: GameState, c: Candidate): GameState {
  let next = applyMove(state, c.piece.id, c.target.row, c.target.col);
  if (next.phase !== 'playing') return next;
  // For an ant move, applyMove leaves the same player on turn (ant can
  // still rotate / End Turn). Force-end so the simulation reflects the
  // committed turn boundary.
  if (next.currentPlayer === state.currentPlayer && c.piece.type === 'ant') {
    next = applyEndTurn(next);
  }
  return next;
}

// ─── Pickers per level ───────────────────────────────────────────────────────

function pickRandom(state: GameState, player: Player): AiMove | null {
  const moves = listLegalMoves(state, player);
  if (moves.length === 0) return null;
  const c = moves[Math.floor(Math.random() * moves.length)];
  return { pieceId: c.piece.id, target: c.target, rotateTo: pickAntRotation(state, c, player) };
}

function pickGreedy(state: GameState, player: Player): AiMove | null {
  const moves = listLegalMoves(state, player);
  if (moves.length === 0) return null;
  let bestScore = -Infinity;
  let best: Candidate[] = [];
  for (const c of moves) {
    const after = simulate(state, c);
    const score = evaluate(after, player);
    if (score > bestScore) { bestScore = score; best = [c]; }
    else if (score === bestScore) best.push(c);
  }
  const pick = best[Math.floor(Math.random() * best.length)];
  return { pieceId: pick.piece.id, target: pick.target, rotateTo: pickAntRotation(state, pick, player) };
}

/** 2-ply minimax, branch-limited for performance.
 *  - Generate all of my legal moves, score each with 1-ply eval, keep the
 *    top N candidates.
 *  - For each candidate, simulate the opponent's best (greedy) response
 *    and take the resulting evaluation as the candidate's true value.
 *  - Pick the candidate that maximises that value. */
function pickMinimax(state: GameState, player: Player): AiMove | null {
  const opp: Player = player === 1 ? 2 : 1;
  const moves = listLegalMoves(state, player);
  if (moves.length === 0) return null;

  // 1-ply pre-rank — eval each move from my POV, take the strongest
  // candidates as the deeper-search seed set. Caps total work at
  // CANDIDATES × opp-move-count, which on a typical mid-game board is
  // ~8 × 100 = 800 simulations. Plenty fast for an interactive game.
  const CANDIDATES = 8;
  const ranked = moves.map(c => ({ c, after: simulate(state, c) }));
  ranked.sort((a, b) => evaluate(b.after, player) - evaluate(a.after, player));
  const seeds = ranked.slice(0, CANDIDATES);

  let bestScore = -Infinity;
  let best: Candidate[] = [];
  for (const { c, after } of seeds) {
    // If our move already won the game, we're done — no opponent reply.
    if (after.phase === 'won') {
      const score = evaluate(after, player);
      if (score > bestScore) { bestScore = score; best = [c]; }
      else if (score === bestScore) best.push(c);
      continue;
    }
    const oppMoves = listLegalMoves(after, opp);
    let worstForMe = Infinity;
    if (oppMoves.length === 0) {
      worstForMe = evaluate(after, player);
    } else {
      for (const om of oppMoves) {
        const after2 = simulate(after, om);
        const myScore = evaluate(after2, player);
        if (myScore < worstForMe) worstForMe = myScore;
      }
    }
    if (worstForMe > bestScore) { bestScore = worstForMe; best = [c]; }
    else if (worstForMe === bestScore) best.push(c);
  }
  const pick = best[Math.floor(Math.random() * best.length)];
  return { pieceId: pick.piece.id, target: pick.target, rotateTo: pickAntRotation(state, pick, player) };
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
    case 'monkey':    return pickGreedy(state, player);
    case 'lion':      return pickMinimax(state, player);
  }
}

/** Display labels — used by the HUD / start screen. Kept here so the
 *  difficulty list lives next to the AI logic itself. */
export const AI_LEVEL_META: Record<AiLevel, { emoji: string; label: string }> = {
  butterfly: { emoji: '🦋', label: 'Easy' },
  monkey:    { emoji: '🐒', label: 'Medium' },
  lion:      { emoji: '🦁', label: 'Hard' },
};
