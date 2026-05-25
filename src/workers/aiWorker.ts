// Web Worker entry for offline AI calculation.
//
// The Hard/Lion bot runs an up-to-1.8s iterative-deepening search; running it
// on the main thread froze the UI during the bot's "thinking" window. This
// worker runs the SAME `chooseAiMove` off-thread so the page stays responsive.
//
// Imports are pure game logic (ai → logic → constants → types) with no DOM
// access, so they're safe in a worker. `performance` and `Math.random` (used
// by the search) both exist in the worker global scope.
//
// Loaded by aiWorkerClient via `new Worker(new URL('./aiWorker.ts', ...))`,
// which Next.js/Webpack 5 bundles as its own chunk.

import { chooseAiMove } from '../game/ai';
import type { AiMove } from '../game/ai';
import type { GameState, Player, AiLevel } from '../game/types';

export interface AiWorkerRequest {
  requestId: number;
  state: GameState;
  player: Player;
  level: AiLevel;
}

export interface AiWorkerResponse {
  requestId: number;
  move: AiMove | null;
  durationMs: number;
  /** Present only when the search threw; the client falls back to main thread. */
  error?: string;
}

// The project's tsconfig uses the DOM lib (not webworker), so `self` is typed
// as a Window. Narrow it to just the two members we use, with a single-arg
// postMessage, to avoid the Window.postMessage(targetOrigin) signature.
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<AiWorkerRequest>) => void) | null;
  postMessage: (message: AiWorkerResponse) => void;
};

ctx.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  const { requestId, state, player, level } = event.data;
  const start = performance.now();
  try {
    const move = chooseAiMove(state, player, level);
    ctx.postMessage({ requestId, move, durationMs: performance.now() - start });
  } catch (err) {
    ctx.postMessage({
      requestId,
      move: null,
      durationMs: performance.now() - start,
      error: err instanceof Error ? err.message : 'ai worker error',
    });
  }
};
