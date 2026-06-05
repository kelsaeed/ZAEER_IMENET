# Architecture

How Zaeer Imenet is put together — the layers, the online trust boundary, and
the data flow for a move. The guiding principle is a **pure, deterministic game
engine** that every mode (local, vs-AI, online) reuses, with the server treated
as the single source of truth for ranked online play.

## High-level

```
┌─────────────────────────── Browser (Next.js App Router) ───────────────────────────┐
│                                                                                     │
│   src/app/*          React Server/Client components, routes, API handlers           │
│   src/components/*    Presentation (GameBoard, GameHUD, …) — no game rules           │
│   src/hooks/*         State + orchestration (useGame, useOnlineGame, usePuzzle…)     │
│   src/game/*          PURE engine: rules, AI, validation — no React, no I/O          │
│   src/workers/*       AI minimax runs here, off the main thread                      │
│                                                                                     │
└───────────────┬──────────────────────────────────────────────┬──────────────────────┘
                │ HTTP (move/give-up/start)                      │ WebSocket (Realtime)
                ▼                                                ▼
┌──────────────────────────────────── Supabase ───────────────────────────────────────┐
│   Postgres + Row-Level Security   ·   Auth   ·   Realtime   ·   Storage              │
│   supabase/migrations/*.sql  (schema, RLS policies, ELO trigger, rate-limit RPC)     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Layers (strict dependency direction)

The dependency arrow only ever points **downward** — UI may import the engine, but
the engine never imports React. That separation is what keeps the rules testable
in plain Node and reusable across every mode.

| Layer | Location | Responsibility | Knows about React? |
| --- | --- | --- | --- |
| Routes / API | `src/app` | Pages, layouts, API route handlers | — |
| Components | `src/components` | Rendering only (board, HUD, modals) | Yes |
| Hooks | `src/hooks` | Local state, effects, server orchestration | Yes |
| Engine | `src/game` | Rules, move generation, combat, AI, puzzle validation | **No** |
| Data access | `src/lib/supabase`, `src/lib/server` | Queries, mutations, rate limiting | No |

The engine (`src/game/logic.ts`, `ai.ts`, `onlineActions.ts`, `puzzleValidator.ts`)
is a pure function of game state. It is unit-tested directly, with no DOM or
network, which is why the test suite runs in milliseconds under Node's built-in
runner.

## Online move flow (server-authoritative)

Online ranked play does **not** trust the client. The browser renders
optimistically for responsiveness, but the server re-derives the result from the
same pure engine before anything is persisted.

```
Player taps a cell
   │
   ▼
useOnlineGame applies the move locally (optimistic UI) ──► board updates instantly
   │
   ▼
POST /api/games/[gameId]/move
   │
   ├─► rate limit  (src/lib/server/rateLimit.ts)
   │      in-memory fixed-window pre-filter → Postgres RPC → fail-open
   │
   ├─► authorize   (is this user a participant? whose turn is it?)
   │
   ├─► re-validate the move with the PURE engine (src/game/onlineActions.ts)
   │      an illegal/tampered move is rejected here, regardless of the client
   │
   └─► persist with optimistic concurrency (turn number guards a stale write)
          │
          ▼
   Postgres row updates ──► Supabase Realtime broadcasts the new state
          │
          ▼
   Opponent's useOnlineGame receives the update and reconciles its board
```

Because the persisted result is whatever the **engine** produces — not whatever the
client claims — a regression in the engine is an integrity regression, which is
why CI gates every push on the engine tests.

## AI

The vs-AI opponent runs a minimax search (`src/game/ai.ts`) inside a **Web Worker**
(`src/workers/aiWorker.ts`, driven by `src/lib/ai/aiWorkerClient.ts`). Running the
search off the main thread keeps the UI responsive even while the harder levels
think. The same engine the human plays through is the engine the AI searches over.

## Persistence & security

- **PostgreSQL** schema, **Row-Level Security** policies, an **ELO** rating trigger,
  and the rate-limit RPC all live as versioned migrations in `supabase/migrations`.
- **RLS** enforces access at the database layer — a user can only read/write the
  matches, friendships, chats, and profile rows they're entitled to.
- **Auth** is Supabase email auth; the session is carried through Next.js
  middleware (`middleware.ts`, `src/lib/supabase/middleware.ts`).

## Internationalization

UI strings live in `src/game/locales.ts` (English + Arabic) and resolve through a
`t()` helper, with full **RTL** layout support driven by the active locale.

## Testing & CI

- `npm test` runs the engine, AI, online-action, and rate-limiter suites with
  Node's built-in test runner (no Jest/Vitest dependency).
- `.github/workflows/ci.yml` runs **typecheck → test → production build** on every
  push and pull request.
- **Linting** runs locally via a pre-commit hook (husky + lint-staged) and `npm run lint`.

## Directory map

```
src/
  app/            routes, layouts, and API handlers (move / give-up / start / today)
  components/     presentational React components (board, HUD, modals, chat)
  hooks/          stateful orchestration (useGame, useOnlineGame, usePuzzleSession, …)
  game/           pure engine: logic, ai, onlineActions, puzzleValidator, locales
  lib/
    supabase/     typed data-access for profiles, games, friends, chat, themes
    server/       server-only concerns (rate limiting)
    ai/           Web Worker client
  workers/        the AI worker
supabase/
  migrations/     versioned SQL: schema, RLS, ELO trigger, rate-limit RPC
```
