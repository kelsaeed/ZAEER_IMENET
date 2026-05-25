# Offline AI on a Web Worker

Moves the offline vs-bot AI search off the main thread so the Hard/Lion bot's
up-to-1.8s minimax no longer freezes the UI while it "thinks". Offline-only;
no change to AI behavior, game rules, online play, or server-authoritative
move validation.

## Old main-thread problem

`useGame`'s AI scheduler ran `chooseAiMove(prev, 2, level)` **synchronously
inside a `setState` updater**, 600ms after the bot's turn began. The 600ms was
only a cosmetic "thinking" delay — the search itself (iterative deepening to
depth 5 within a 1.8s budget for `lion`) ran on the main thread, blocking
input, hover, menus, and animations for the duration.

## New architecture

```
useGame effect ──(600ms)──▶ requestAiMove(state, 2, level)
                               │
              aiWorkerClient ──┼──▶ Web Worker (aiWorker.ts) ──▶ chooseAiMove (off-thread)
                               │                                      │
                               ◀────────── { requestId, move } ◀──────┘
                               │
                 promise.then(move) ─▶ setState (re-validated via aiResultStillApplies)
```

- **`src/workers/aiWorker.ts`** — worker entry. Receives `{ requestId, state,
  player, level }`, calls the existing `chooseAiMove`, posts back
  `{ requestId, move, durationMs, error? }`. Pure game-logic imports only (no
  DOM); `performance`/`Math.random` exist in the worker scope. Catches throws
  and returns a structured `error` instead of crashing.
- **`src/lib/ai/aiWorkerClient.ts`** — lazily creates ONE worker on first use
  and reuses it; tracks requests by id; exposes `requestAiMove()` returning
  `{ promise, cancel }`; `cancel()` terminates the worker to kill an in-flight
  search and the worker is recreated on the next request.
- **`src/game/aiTurn.ts`** — pure guards `isAiTurn()` / `aiResultStillApplies()`
  shared by the effect (to decide it's the bot's turn) and the result handler
  (to reject a stale async result). Unit-tested.
- **`src/hooks/useGame.ts`** — the AI scheduler now `await`s the worker and
  applies the move through `setState` only if `aiResultStillApplies(prev,
  thinkAtTurn)`; the effect cleanup cancels the request.

## Which difficulties use the worker

**All offline vs-bot levels** (`butterfly`/`monkey`/`lion`) go through the
worker via one code path — simpler to reason about and guarantees no level can
block the main thread. `lion` is the one that actually needed it; routing the
cheap levels through too costs only a structured-clone of `GameState` (plain
JSON, fast). The puzzle solver and admin SolutionRecorder still call
`chooseAiMove` directly (separate flows, out of scope — see follow-ups).

## Fallback behavior

If `Worker` is unavailable (SSR, ancient browser) or worker **creation
throws**, `requestAiMove` runs `chooseAiMove` synchronously on the main thread
and resolves immediately — identical to the old behavior. A **per-request
error** posted by the worker (search threw) also falls back to the main
thread, so the bot always moves. A **worker crash** (`onerror`) resolves all
pending requests to fall back and drops the worker for recreation.

## Cancellation / stale-result behavior

- Each request gets a monotonic `requestId`; the client matches results to
  requests and ignores unknown ids.
- The effect stamps `thinkAtTurn = state.turn` at request time. When the
  result arrives, `setState` applies it only if `aiResultStillApplies(prev,
  thinkAtTurn)` — i.e. it's still the bot's turn AND the turn counter hasn't
  advanced. A turn only advances on a committed move, so this rejects results
  for any superseded position.
- The effect cleanup (fires on reset, restart, menu, history review, mode
  flip, navigation, or the next turn) sets a `cancelled` flag, clears the
  600ms timer, and calls `cancel()` — which settles the promise to `null` and
  **terminates the worker**, immediately killing a long in-flight search.
- Net result: resetting or navigating away mid-think never applies a stale
  move and never throws.

## Files changed

| File | Change |
| --- | --- |
| `src/workers/aiWorker.ts` | **New.** Worker entry; runs `chooseAiMove` off-thread. |
| `src/lib/ai/aiWorkerClient.ts` | **New.** Lazy worker, request tracking, cancellation, main-thread fallback. |
| `src/game/aiTurn.ts` | **New.** Pure `isAiTurn` / `aiResultStillApplies` guards. |
| `src/game/aiTurn.test.ts` | **New.** 9 unit tests for the guards. |
| `src/hooks/useGame.ts` | AI scheduler now async via the worker; result re-validated before apply; cleanup cancels. `aiThinking` reuses `isAiTurn`. |

No changes to `ai.ts` (the search/eval is untouched), online code, or schema.

## Tests

- `src/game/aiTurn.test.ts` — `isAiTurn` true only on a live bot turn; false
  for no-AI / human turn / won / history-review. `aiResultStillApplies` true
  on the same turn; false when the turn advanced, after a menu reset, or when
  it became the human's turn.
- Existing `ai.test.ts` (calls `chooseAiMove` directly) is unaffected — the
  worker runs the same function, so AI behavior/legality guarantees still hold.
- The worker client's Worker/postMessage path is browser-only and isn't
  unit-tested under `node:test` (no real Workers); the pure request-validity
  logic that matters is covered by `aiTurn.test.ts`. See the manual checklist.

## Manual browser checklist

Enable the FPS overlay first: `localStorage.setItem('zaeer.perf','1')` + reload.

- [ ] Offline **easy** AI still moves and plays legally.
- [ ] Offline **medium** AI still moves and plays legally.
- [ ] Offline **hard/Lion** AI still moves and plays legally.
- [ ] While **Lion** is thinking, hover/click/menu stay responsive and the FPS
      readout doesn't crater (it used to stall for up to ~1.8s).
- [ ] **Reset / Main Menu** during the bot's think does NOT later apply a
      stale AI move.
- [ ] **Restart Match** during the bot's think starts fresh cleanly.
- [ ] **Navigate away** (to /play, /tutorial) during a think throws no console
      errors.
- [ ] Ant bot move: **move + rotate + End Turn** commits correctly.
- [ ] **Tutorial** unaffected (it doesn't use the vs-bot scheduler).
- [ ] **Online** game unaffected (server-authoritative; no local AI).
- [ ] **Arabic/RTL** offline game still works.

## Remaining performance follow-ups

- **Puzzle solver / admin SolutionRecorder** still call `chooseAiMove` on the
  main thread (`puzzle/page.tsx`, `SolutionRecorder.tsx`). Different flows,
  out of scope here; could reuse `aiWorkerClient` later.
- **Worker warm-up:** the worker is created lazily on the bot's first move, so
  the very first Lion think pays a one-time chunk-load. Could pre-warm when an
  AI game starts if it's ever noticeable.
- **Transferables:** `GameState` is structured-cloned each request (small, ~a
  few KB). Fine at this size; not worth optimizing.

## Validation

- `npm run typecheck` — **passes** (`tsc --noEmit`, strict; includes the
  worker file and `import.meta.url`).
- `npm test` — **passes, 103/103** (+9 `aiTurn` tests).
- `npm run build` — **passes**; Webpack emits the worker as its own chunk
  (verified the worker bundle and the `new Worker(new URL(...))` wiring exist
  in `.next/static`). Route sizes unchanged.
- `npm run lint` — **not configured** (no `lint` script, no ESLint config).
