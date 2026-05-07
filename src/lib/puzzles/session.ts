// Puzzle session helpers — pure functions for navigating the proof tree
// from the player API. No I/O; the caller fetches the tree and the
// attempt's submitted-moves prefix and passes them in.
//
// The tree is the single source of truth for "what is the right move".
// On every player submission the API replays the prefix to find the
// current AttackerNode, then compares the submission against that
// node's pinned move. Wrong submissions never reveal the right answer.

import type {
  AttackerNode,
  DefenderBranch,
  PuzzleMove,
  SolutionNode,
} from '@/game/puzzleTypes';
import { movesEqual } from '@/game/puzzleTypes';

export type SessionCursor =
  | { kind: 'awaiting-attacker'; node: AttackerNode; ply: number }
  | { kind: 'killed'; ply: number };

/** Walk the tree using the player's submitted attacker moves so far.
 *  Each attacker move advances along the canonical defender branch
 *  (defenderBranches[0]) — that's the move the API returned to the
 *  player after their previous correct submission, so the player's
 *  next move must match the next attacker node down that same branch. */
export function cursorAfterMoves(tree: SolutionNode, attackerMoves: PuzzleMove[]): SessionCursor {
  let cur: SolutionNode = tree;
  let ply = 0;
  for (const m of attackerMoves) {
    if (cur.type === 'kill') {
      // Already won on a previous submission — nothing further to play.
      return { kind: 'killed', ply };
    }
    if (!movesEqual(cur.move, m)) {
      // The API should never call us with a prefix that doesn't match;
      // a desync here is a bug, not a player-visible state. Surface it
      // as "puzzle is over for this attempt" so downstream defaults to
      // refusing further submissions.
      return { kind: 'killed', ply };
    }
    ply += 1;
    if (cur.defenderBranches.length === 0) {
      // Attacker move ended the game with no defender turn — terminal.
      return { kind: 'killed', ply };
    }
    const branch = canonicalBranch(cur);
    cur = branch.next;
    ply += branch.reply ? 1 : 0;
  }
  if (cur.type === 'kill') return { kind: 'killed', ply };
  return { kind: 'awaiting-attacker', node: cur, ply };
}

/** The canonical defender reply at an attacker node. We pick the first
 *  branch deterministically — the validator built the tree in stable
 *  enumeration order, so the same tree always yields the same reply. */
export function canonicalBranch(node: AttackerNode): DefenderBranch {
  return node.defenderBranches[0];
}

export interface ResolveAttempt {
  /** True if the player's move matches the expected attacker move at
   *  the current cursor. */
  correct: boolean;
  /** When correct: the canonical defender reply the API returns to the
   *  player so they can render the new position. Null means there is no
   *  defender turn (the attacker move ended the game). */
  defenderReply?: PuzzleMove | null;
  /** When correct AND the resulting state is a kill, the puzzle is
   *  solved on this submission. */
  solved?: boolean;
  /** The cursor the next call should see after this submission. The
   *  caller persists the move list, NOT this object. */
  nextCursor?: SessionCursor;
}

/** Decide what happens when the player submits `move` at the current
 *  cursor. Pure — does not mutate inputs and does not perform I/O. */
export function resolveSubmission(cursor: SessionCursor, move: PuzzleMove): ResolveAttempt {
  if (cursor.kind === 'killed') {
    // Puzzle already over for this attempt; refuse silently.
    return { correct: false };
  }
  const expected = cursor.node.move;
  if (!movesEqual(expected, move)) {
    return { correct: false };
  }
  // Correct attacker move — descend along the canonical branch.
  if (cursor.node.defenderBranches.length === 0) {
    // Attacker won outright; no defender turn.
    return {
      correct: true,
      defenderReply: null,
      solved: true,
      nextCursor: { kind: 'killed', ply: cursor.ply + 1 },
    };
  }
  const branch = canonicalBranch(cursor.node);
  let nextPly = cursor.ply + 1;
  if (branch.reply) nextPly += 1;
  if (branch.next.type === 'kill') {
    return {
      correct: true,
      defenderReply: branch.reply,
      solved: true,
      nextCursor: { kind: 'killed', ply: nextPly },
    };
  }
  return {
    correct: true,
    defenderReply: branch.reply,
    solved: false,
    nextCursor: { kind: 'awaiting-attacker', node: branch.next, ply: nextPly },
  };
}
