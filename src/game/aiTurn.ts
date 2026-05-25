// Pure helpers for the offline AI turn lifecycle. Extracted from useGame so
// the "is it the bot's turn?" check and the "is this (async) AI result still
// valid to apply?" check share one definition and can be unit-tested without
// React or a Worker.
//
// Why the staleness check matters: the AI now computes on a Web Worker, so a
// result arrives a tick (or up to ~1.8s) after it was requested. Between the
// request and the result the player may have reset the game, returned to the
// menu, started reviewing history, or the clock may have flagged. We stamp the
// turn number at request time and only apply the move if the live state is
// still the same bot turn we asked about.

import type { GameState, Player } from './types';

export const AI_PLAYER: Player = 2;

/** True when the local AI should be making a move right now: vs-AI mode, game
 *  in progress, it's the AI's turn, and we're not reviewing history. */
export function isAiTurn(state: GameState, aiPlayer: Player = AI_PLAYER): boolean {
  return (
    !!state.aiLevel &&
    state.phase === 'playing' &&
    state.currentPlayer === aiPlayer &&
    state.viewingHistoryIndex === null
  );
}

/** True when an AI result computed for `thinkAtTurn` is still safe to apply to
 *  the current state `prev`. Guards against everything that can change while a
 *  worker request is in flight: it must still be the bot's turn AND the turn
 *  counter must not have advanced (a turn only advances on a committed move,
 *  so an unchanged counter means no intervening move happened). */
export function aiResultStillApplies(
  prev: GameState,
  thinkAtTurn: number,
  aiPlayer: Player = AI_PLAYER,
): boolean {
  return isAiTurn(prev, aiPlayer) && prev.turn === thinkAtTurn;
}
