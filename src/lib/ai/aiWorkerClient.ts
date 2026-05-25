'use client';
// Client-side wrapper around the offline AI Web Worker.
//
// Responsibilities:
//  - Lazily create ONE worker the first time the bot needs to think (and
//    reuse it across turns); never create it during SSR/import.
//  - Track requests by id so a result is matched to its request.
//  - Support cancellation: cancelling an in-flight request terminates the
//    worker to kill a long (up to ~1.8s) search immediately; the worker is
//    recreated lazily on the next request.
//  - Fall back to the synchronous main-thread `chooseAiMove` when Workers
//    aren't available (SSR, very old browsers) or when a request errors.
//
// Behaviour is intentionally one-request-at-a-time: offline AI turns are
// sequential, and the caller (useGame) cancels the previous request before
// starting a new one.

import { chooseAiMove, type AiMove } from '@/game/ai';
import type { GameState, Player, AiLevel } from '@/game/types';
import type { AiWorkerRequest, AiWorkerResponse } from '@/workers/aiWorker';

export interface AiMoveHandle {
  /** Resolves with the chosen move (or null). Resolves with null if cancelled. */
  promise: Promise<AiMove | null>;
  /** Abandon the request and kill any in-flight worker search. */
  cancel: () => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (res: AiWorkerResponse) => void>();

function workersSupported(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

function getWorker(): Worker | null {
  if (worker) return worker;
  if (!workersSupported()) return null;
  try {
    const w = new Worker(new URL('../../workers/aiWorker.ts', import.meta.url));
    w.onmessage = (e: MessageEvent<AiWorkerResponse>) => {
      const cb = pending.get(e.data.requestId);
      if (cb) {
        pending.delete(e.data.requestId);
        cb(e.data);
      }
    };
    w.onerror = () => {
      // The worker itself failed (not a per-request error). Resolve every
      // pending request with a synthetic error so each falls back to the
      // main thread, then drop the worker so it's recreated next time.
      const callbacks = Array.from(pending.values());
      pending.clear();
      for (const cb of callbacks) {
        cb({ requestId: -1, move: null, durationMs: 0, error: 'worker crashed' });
      }
      terminateAiWorker();
    };
    worker = w;
    return w;
  } catch {
    worker = null;
    return null;
  }
}

/** Terminate the worker (killing any in-flight computation) and forget it.
 *  Pending callbacks are NOT invoked here — callers that terminate are
 *  responsible for settling their own promise (see `cancel`). */
export function terminateAiWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

/** Run the main-thread AI, guarding against a throw. */
function mainThreadMove(state: GameState, player: Player, level: AiLevel): AiMove | null {
  try {
    return chooseAiMove(state, player, level);
  } catch {
    return null;
  }
}

/** Ask the worker (or main thread) for the AI's move. Returns a handle whose
 *  `promise` settles with the move and whose `cancel()` abandons it. */
export function requestAiMove(state: GameState, player: Player, level: AiLevel): AiMoveHandle {
  const w = getWorker();

  // No worker available — synchronous fallback. Still returns the same shape.
  if (!w) {
    return { promise: Promise.resolve(mainThreadMove(state, player, level)), cancel: () => {} };
  }

  const requestId = nextId++;
  let resolveFn: (move: AiMove | null) => void = () => {};
  const promise = new Promise<AiMove | null>(resolve => {
    resolveFn = resolve;
  });

  pending.set(requestId, (res) => {
    // A per-request error (the search threw inside the worker) falls back to
    // the main thread so the bot still moves.
    if (res.error) resolveFn(mainThreadMove(state, player, level));
    else resolveFn(res.move);
  });

  const payload: AiWorkerRequest = { requestId, state, player, level };
  w.postMessage(payload);

  const cancel = () => {
    if (!pending.has(requestId)) return; // already settled
    pending.delete(requestId);
    resolveFn(null);       // settle so awaiters never hang
    terminateAiWorker();   // kill the in-flight search; recreated on next request
  };

  return { promise, cancel };
}
