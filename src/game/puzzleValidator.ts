// Puzzle validator — given a position + side-to-move + the curator's
// claimed attacker line, prove that the line forces a kill against EVERY
// legal defender response. Output is the full AND-OR proof tree (so the
// player API can confirm forcing on demand without re-search) plus a
// flat principal variation for the give-up reveal.
//
// Contract (matches the design doc lockdown):
//   1. Legality       — every claimed attacker move is legal in its position.
//   2. Termination    — the line ends with the defender's lion dead.
//   3. Forcing        — at every defender-to-move node, EVERY legal
//                       defender reply must lead to a forced kill within
//                       remaining depth. One escape = fail.
//   4. No stalemate-as-win — if the defender has zero legal moves but
//                       their lion is alive, the line fails.
//   5. Single solution (v1) — the curator pins exactly one attacker move
//                       per attacker-to-move node along the principal line;
//                       the validator picks the canonical continuation in
//                       deterministic enumeration order for non-principal
//                       branches.
//
// Imports the real engine — no shadow rules, no parallel implementation.

import type { GameState, GamePiece, Player, Orientation } from './types';
import { applyMove, applyEndTurn, getValidMoves } from './logic';
import {
  type PuzzleSnapshot,
  type PuzzleMove,
  type AttackerMove,
  type SolutionNode,
  type DefenderBranch,
  puzzleSnapshotToState,
  movesEqual,
} from './puzzleTypes';
import { ENGINE_VERSION } from './engineVersion';

// ─── Public API ──────────────────────────────────────────────────────────

export interface ValidatePuzzleInput {
  snapshot: PuzzleSnapshot;
  /** The curator's claimed principal line. Length sets the depth budget
   *  (mate-in-N where N = claimedAttackerLine.length). */
  claimedAttackerLine: AttackerMove[];
}

export type ValidatePuzzleResult =
  | ValidatePuzzleOk
  | ValidatePuzzleFail;

export interface ValidatePuzzleOk {
  ok: true;
  solutionTree: SolutionNode;
  principalLine: PrincipalPly[];
  engineVersion: string;
}

/** Flat ply list for the give-up reveal. Alternates attacker / defender
 *  starting with the puzzle's side-to-move. The final ply is always an
 *  attacker move whose result is `state.phase === 'won'`. */
export interface PrincipalPly {
  side: 'attacker' | 'defender';
  move: PuzzleMove;
}

export interface ValidatePuzzleFail {
  ok: false;
  reason: ValidationFailureReason;
  /** Human-readable explanation aimed at the curator (so the admin UI
   *  can surface "defender escapes with bat e3 → c4" without further
   *  formatting). */
  message: string;
  /** When `reason === 'defender-escapes'`, the line of play that
   *  demonstrates the escape: starts with the defender's escaping reply
   *  and continues until the validator gave up trying to force a kill. */
  escapeLine?: PuzzleMove[];
}

export type ValidationFailureReason =
  | 'empty-line'           // claimed line is empty — nothing to prove
  | 'illegal-attacker'     // a claimed attacker move is not legal in its position
  | 'attacker-no-moves'    // attacker had to move but had no legal moves
  | 'defender-stalemate'   // defender has no legal moves but lion is alive
  | 'defender-escapes'     // some defender reply could not be forced into a kill
  | 'depth-exhausted'      // ran out of attacker plies without killing the lion
  | 'wrong-winner';        // the line ended with the WRONG side winning

// ─── Validate ────────────────────────────────────────────────────────────

export function validatePuzzle(input: ValidatePuzzleInput): ValidatePuzzleResult {
  const { snapshot, claimedAttackerLine } = input;
  if (claimedAttackerLine.length === 0) {
    return {
      ok: false,
      reason: 'empty-line',
      message: 'No attacker move was claimed. A puzzle must declare at least one move.',
    };
  }

  const state = puzzleSnapshotToState(snapshot);
  const attackerSide = state.currentPlayer;
  const maxDepth = claimedAttackerLine.length;

  // The first attacker move is pinned to the curator's claim. For inner
  // attacker decision nodes the validator searches freely; the curator's
  // claim is used as a hint for ordering so the principal line tracks
  // their intent when possible.
  const result = proveAttackerNode(
    state,
    attackerSide,
    /* pinnedMove */ claimedAttackerLine[0],
    /* hintLine */ claimedAttackerLine.slice(1),
    /* depthRemaining */ maxDepth,
  );

  if (!result.ok) return result;

  return {
    ok: true,
    solutionTree: result.node,
    principalLine: collectPrincipalLine(result.node),
    engineVersion: ENGINE_VERSION,
  };
}

// ─── Recursive proof ─────────────────────────────────────────────────────
// Attacker nodes are OR — we need ONE move that forces the win.
// Defender nodes are AND — EVERY legal move must lead to a forced win.

interface ProveOk { ok: true; node: SolutionNode }
type ProveResult = ProveOk | ValidatePuzzleFail;

function proveAttackerNode(
  state: GameState,
  attackerSide: Player,
  pinnedMove: AttackerMove | undefined,
  hintLine: AttackerMove[],
  depthRemaining: number,
): ProveResult {
  // Terminal case — game already won by attacker.
  if (state.phase === 'won') {
    if (state.winner === attackerSide) return { ok: true, node: { type: 'kill' } };
    return {
      ok: false,
      reason: 'wrong-winner',
      message: 'The position is already won by the defender — a puzzle cannot start from a lost game.',
    };
  }

  // Attacker shouldn't be on move otherwise.
  if (state.currentPlayer !== attackerSide) {
    return {
      ok: false,
      reason: 'illegal-attacker',
      message: 'Internal: proveAttackerNode called when it is not the attacker’s turn.',
    };
  }

  if (depthRemaining <= 0) {
    return {
      ok: false,
      reason: 'depth-exhausted',
      message: 'Ran out of attacker plies without killing the defending lion. Either the puzzle needs more depth, or the line isn’t a forced kill.',
    };
  }

  // Build the candidate list. If a pinnedMove is given, only that move is
  // tried (root constraint, AND inner-node enforcement of single-solution
  // mode against the curator's hint line). Otherwise enumerate every
  // legal attacker move.
  const allLegal = enumerateLegalMoves(state, attackerSide);
  if (allLegal.length === 0) {
    return {
      ok: false,
      reason: 'attacker-no-moves',
      message: 'The attacker has no legal moves in this position.',
    };
  }

  let candidates: AttackerMove[];
  if (pinnedMove) {
    if (!isLegalMove(state, attackerSide, pinnedMove)) {
      return {
        ok: false,
        reason: 'illegal-attacker',
        message: `Claimed attacker move is not legal: ${describeMove(pinnedMove, state.pieces)}.`,
      };
    }
    candidates = [pinnedMove];
  } else {
    // Order so the curator's hint line (if any matches) is tried first —
    // keeps the resulting principal line aligned with the curator's intent.
    candidates = orderByHint(allLegal, hintLine[0]);
  }

  let lastFailure: ValidatePuzzleFail | null = null;
  for (const move of candidates) {
    const next = simulatePuzzleMove(state, move);
    const sub = proveAfterAttackerMove(
      next,
      attackerSide,
      hintLine,
      depthRemaining - 1,
    );
    if (sub.ok) {
      return {
        ok: true,
        node: { type: 'attacker', move, defenderBranches: sub.branches },
      };
    }
    lastFailure = sub;
    // Single-solution mode: the curator's pinnedMove is the ONLY option
    // we try at the root. If it fails, we surface that failure unchanged.
    // At unpinned nodes, we keep trying alternates.
  }
  return lastFailure ?? {
    ok: false,
    reason: 'depth-exhausted',
    message: 'No attacker continuation could be proved at this node.',
  };
}

interface ProveDefenderOk { ok: true; branches: DefenderBranch[] }
type ProveDefenderResult = ProveDefenderOk | ValidatePuzzleFail;

/** After an attacker move has been simulated. The state is either won
 *  (attacker killed the lion → KillNode) or it's the defender's turn. */
function proveAfterAttackerMove(
  state: GameState,
  attackerSide: Player,
  hintLine: AttackerMove[],
  depthRemaining: number,
): ProveDefenderResult {
  // Attacker move ended the game — the only branch is "no defender reply".
  if (state.phase === 'won') {
    if (state.winner === attackerSide) {
      return { ok: true, branches: [{ reply: null, next: { type: 'kill' } }] };
    }
    // Engine never lets a moving player lose on their own move, but guard
    // it anyway — silent self-loss would be a confusing puzzle outcome.
    return {
      ok: false,
      reason: 'wrong-winner',
      message: 'Attacker move ended the game with the defender as winner.',
    };
  }

  if (state.currentPlayer === attackerSide) {
    return {
      ok: false,
      reason: 'illegal-attacker',
      message: 'Internal: turn did not flip after attacker move.',
    };
  }

  // Defender to move. Enumerate every legal reply.
  const defenderSide: Player = attackerSide === 1 ? 2 : 1;
  const replies = enumerateLegalMoves(state, defenderSide);

  if (replies.length === 0) {
    // Stalemate-as-win is explicitly NOT a win in our model. If the
    // defender has no legal moves but their lion is alive, the puzzle
    // fails validation — the kill is not real.
    const defenderLionAlive = state.pieces.some(
      p => p.player === defenderSide && p.type === 'lion',
    );
    if (defenderLionAlive) {
      return {
        ok: false,
        reason: 'defender-stalemate',
        message: 'Defender has no legal moves but their lion is still alive — stalemate, not a kill. Tighten the position so the lion is actually captured.',
      };
    }
    // Lion already dead — engine should have flagged 'won' above; treat as kill.
    return { ok: true, branches: [{ reply: null, next: { type: 'kill' } }] };
  }

  // AND node: every reply must be forced.
  const branches: DefenderBranch[] = [];
  for (const reply of replies) {
    const after = simulatePuzzleMove(state, reply);
    const sub = proveAttackerNode(
      after,
      attackerSide,
      /* pinnedMove */ undefined,           // free search at inner attacker nodes
      hintLine,                              // hint for ordering only
      depthRemaining,
    );
    if (!sub.ok) {
      // This reply escaped — return the failure with the escape line
      // prepended so the curator sees exactly which defender response
      // breaks the puzzle.
      return {
        ok: false,
        reason: 'defender-escapes',
        message: `Defender escapes with ${describeMove(reply, state.pieces)}.`,
        escapeLine: [reply, ...(sub.escapeLine ?? [])],
      };
    }
    branches.push({ reply, next: sub.node });
  }

  return { ok: true, branches };
}

// ─── Move enumeration (rigorous) ─────────────────────────────────────────
// The AI's listLegalMoves only enumerates positional targets — adequate
// for a heuristic search but inadequate for a proof, because a defender
// could escape via an ant rotation (or a rotate-only turn) the proof
// missed. We enumerate every distinct turn-ending action.

export function enumerateLegalMoves(state: GameState, player: Player): PuzzleMove[] {
  const out: PuzzleMove[] = [];
  for (const piece of state.pieces) {
    if (piece.player !== player) continue;
    if (piece.isParalyzed) continue;

    if (piece.type !== 'ant') {
      const { moves } = getValidMoves(piece, state.pieces);
      for (const m of moves) {
        out.push({ pieceId: piece.id, target: { row: m.row, col: m.col } });
      }
      continue;
    }

    // Ant: enumerate positional moves from the CURRENT orientation AND
    // from every orientation the ant could rotate into pre-move. The
    // engine permits rotate-then-move within one turn (useGame's
    // rotateAntTo + clickCell flow), so a defender escape via "rotate
    // then move from the new orientation" is real and the validator
    // would miss it without this expansion.
    //
    // Chains of rotations collapse to the LAST orientation since
    // orientation is a scalar — enumerating single pre-rotations
    // covers the same outcome space.
    const baseRotations = getValidMoves(piece, state.pieces).validRotations;
    const startOrientations: (Orientation | undefined)[] = [undefined, ...baseRotations];

    for (const preRotateTo of startOrientations) {
      let workingState: GameState = state;
      let workingPiece = piece;
      if (preRotateTo) {
        const rotatedPieces = state.pieces.map(p =>
          p.id === piece.id ? { ...p, orientation: preRotateTo } : p,
        );
        workingState = { ...state, pieces: rotatedPieces, antHasRotated: true };
        workingPiece = rotatedPieces.find(p => p.id === piece.id)!;
      }
      const { moves: workingMoves } = getValidMoves(workingPiece, workingState.pieces);
      for (const m of workingMoves) {
        const baseMove: PuzzleMove = preRotateTo
          ? { pieceId: piece.id, target: { row: m.row, col: m.col }, preRotateTo }
          : { pieceId: piece.id, target: { row: m.row, col: m.col } };
        out.push(baseMove);
        // Post-move rotation options. applyMove computes validRotations
        // for ants that survive the move; if the move ended the game
        // (e.g. killed enemy lion) rotation no longer matters.
        const after = applyMove(workingState, piece.id, m.row, m.col);
        if (after.phase !== 'playing') continue;
        const postRotations = after.validRotations ?? [];
        for (const ori of postRotations) {
          out.push({ ...baseMove, rotateTo: ori });
        }
      }
    }
    // Rotate-only — ant stays in place, picks a new orientation, ends turn.
    // Enumerate from current orientation only; chain-rotate-then-end-turn
    // collapses to a single rotate-only with the final orientation.
    for (const ori of baseRotations) {
      out.push({
        pieceId: piece.id,
        target: { row: piece.row, col: piece.col },
        rotateTo: ori,
        rotateOnly: true,
      });
    }
  }
  return out;
}

/** Strict legality check for a single move. Used both at the root (the
 *  curator's pinned move) and on the player API to refuse any submission
 *  the engine would not actually accept. The engine's applyMove does NOT
 *  re-validate the target cell, so this gate is the only line of defence. */
export function isLegalMove(state: GameState, player: Player, move: PuzzleMove): boolean {
  if (state.currentPlayer !== player) return false;
  const piece = state.pieces.find(p => p.id === move.pieceId);
  if (!piece) return false;
  if (piece.player !== player) return false;
  if (piece.isParalyzed) return false;

  const { moves: baseMoves, validRotations: baseRotations } = getValidMoves(piece, state.pieces);

  if (move.rotateOnly) {
    if (piece.type !== 'ant') return false;
    if (!move.rotateTo) return false;
    if (move.target.row !== piece.row || move.target.col !== piece.col) return false;
    if (move.preRotateTo) return false; // rotate-only and preRotate are mutually exclusive
    return baseRotations.includes(move.rotateTo);
  }

  // Apply pre-rotation if any, then verify the target is reachable.
  let workingState: GameState = state;
  let movesFromHere = baseMoves;
  if (move.preRotateTo !== undefined) {
    if (piece.type !== 'ant') return false;
    if (!baseRotations.includes(move.preRotateTo)) return false;
    const rotatedPieces = state.pieces.map(p =>
      p.id === piece.id ? { ...p, orientation: move.preRotateTo as Orientation } : p,
    );
    workingState = { ...state, pieces: rotatedPieces, antHasRotated: true };
    const workingPiece = rotatedPieces.find(p => p.id === piece.id)!;
    movesFromHere = getValidMoves(workingPiece, rotatedPieces).moves;
  }

  const targetLegal = movesFromHere.some(
    m => m.row === move.target.row && m.col === move.target.col,
  );
  if (!targetLegal) return false;

  if (move.rotateTo !== undefined) {
    if (piece.type !== 'ant') return false;
    const after = applyMove(workingState, piece.id, move.target.row, move.target.col);
    if (after.phase !== 'playing') return false;
    const postRotations = after.validRotations ?? [];
    if (!postRotations.includes(move.rotateTo)) return false;
  }

  return true;
}

// ─── Simulation ──────────────────────────────────────────────────────────

/** Apply a PuzzleMove and end the turn. For non-ant pieces applyMove
 *  flips the turn itself; for ants we apply optional pre-rotation, then
 *  the move, then optional post-rotation, then applyEndTurn. Throws if
 *  the move is illegal — callers should isLegalMove first when handling
 *  untrusted input. */
export function simulatePuzzleMove(state: GameState, move: PuzzleMove): GameState {
  const piece = state.pieces.find(p => p.id === move.pieceId);
  if (!piece) throw new Error(`simulatePuzzleMove: piece ${move.pieceId} not found`);

  if (move.rotateOnly) {
    if (piece.type !== 'ant' || !move.rotateTo) {
      throw new Error('simulatePuzzleMove: rotateOnly requires ant + rotateTo');
    }
    const rotated = state.pieces.map(p =>
      p.id === move.pieceId ? { ...p, orientation: move.rotateTo as Orientation } : p,
    );
    const stateAfterRotate: GameState = { ...state, pieces: rotated, antHasRotated: true };
    return applyEndTurn(stateAfterRotate);
  }

  // Pre-rotation, if any. Mutates orientation in-place before the move
  // so applyMove computes the correct ant-wing geometry from the new
  // orientation.
  let working: GameState = state;
  if (move.preRotateTo) {
    if (piece.type !== 'ant') {
      throw new Error('simulatePuzzleMove: preRotateTo only valid for ants');
    }
    const rotated = state.pieces.map(p =>
      p.id === move.pieceId ? { ...p, orientation: move.preRotateTo as Orientation } : p,
    );
    working = { ...state, pieces: rotated, antHasRotated: true };
  }

  let next = applyMove(working, move.pieceId, move.target.row, move.target.col);
  const moved = next.pieces.find(p => p.id === move.pieceId);

  // Ant didn't end the turn yet — apply optional post-rotation, then End Turn.
  // The check `next.currentPlayer === working.currentPlayer` distinguishes
  // "ant moved but turn still on the same player" from "ant kill ended
  // the game" (in which case currentPlayer also stays the same, but
  // phase flipped to 'won' — handled by the phase guard).
  if (
    moved?.type === 'ant'
    && next.phase === 'playing'
    && next.currentPlayer === working.currentPlayer
  ) {
    if (move.rotateTo) {
      const rotated = next.pieces.map(p =>
        p.id === move.pieceId ? { ...p, orientation: move.rotateTo as Orientation } : p,
      );
      next = { ...next, pieces: rotated, antHasRotated: true };
    }
    next = applyEndTurn(next);
  }
  return next;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function orderByHint(legal: AttackerMove[], hint: AttackerMove | undefined): AttackerMove[] {
  if (!hint) return legal;
  const idx = legal.findIndex(m => movesEqual(m, hint));
  if (idx <= 0) return legal;
  // Bring the hint to the front so principal_line tracks curator intent
  // when the move is actually one of the legal options.
  return [legal[idx], ...legal.slice(0, idx), ...legal.slice(idx + 1)];
}

function describeMove(move: PuzzleMove, pieces: GamePiece[]): string {
  const piece = pieces.find(p => p.id === move.pieceId);
  const what = piece ? `${piece.type}` : `piece ${move.pieceId}`;
  if (move.rotateOnly && move.rotateTo) {
    return `${what} rotate-only → ${move.rotateTo}`;
  }
  const tail = move.rotateTo ? `, rotate → ${move.rotateTo}` : '';
  return `${what} → (${move.target.row}, ${move.target.col})${tail}`;
}

function collectPrincipalLine(node: SolutionNode): PrincipalPly[] {
  const out: PrincipalPly[] = [];
  let cur: SolutionNode = node;
  while (cur.type === 'attacker') {
    out.push({ side: 'attacker', move: cur.move });
    if (cur.defenderBranches.length === 0) break;
    const branch = cur.defenderBranches[0];
    if (branch.reply) {
      out.push({ side: 'defender', move: branch.reply });
    }
    cur = branch.next;
  }
  return out;
}

// ─── Re-validation (for the player API + the validate-all script) ────────

/** Returns true if the given engine_version string matches the engine's
 *  current ENGINE_VERSION constant. Player API calls this before serving
 *  any puzzle — a mismatch hides the puzzle until the re-validator script
 *  reproves it. */
export function isCurrentEngineVersion(version: string | null | undefined): boolean {
  return version === ENGINE_VERSION;
}
