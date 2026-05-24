# Engine / AI test foundation + CI

This change adds an automated test foundation around the core game engine,
the local AI, and the server-authoritative online layer, plus a GitHub
Actions workflow that runs typecheck / tests / build on every PR and push to
`main`. **No engine code, game rules, UI, or Supabase runtime logic were
changed** — this is purely additive test + CI scaffolding.

Why now: online integrity is server-authoritative and re-runs the *pure
engine* to validate every move (see `SERVER_AUTHORITATIVE_MOVES_REPORT.md`).
That makes an engine bug an integrity bug, so the engine needs a real safety
net under CI.

## Files changed

| File | Change |
| --- | --- |
| `src/game/testHelpers.ts` | **New.** Shared, framework-free test factories: `piece()`, `makeState()`, `getPieceAt()`, `legalTargets()`, `legalRotations()`, `expectLegalMove()`/`expectIllegalMove()`. Not a `*.test.ts`, so the runner ignores it. |
| `src/game/logic.test.ts` | **New.** Core engine rule tests (movement, kill cycle, special-piece mechanics, blockers, turn/win/history). |
| `src/game/ai.test.ts` | **New.** Deterministic AI safety tests (legal/well-formed moves, null guards, forced-win pick, stability). |
| `src/game/onlineActions.test.ts` | Extended with engine-agreement regression tests (online vs. direct engine, illegal rejection, win propagation). |
| `.github/workflows/ci.yml` | **New.** CI: Node 20, `npm ci`, typecheck, test, build, on `pull_request` + push to `main`. |
| `ENGINE_AI_TESTS_AND_CI_REPORT.md` | **New.** This report. |

The test runner is unchanged — Node's built-in `node:test` via `tsx`
(`npm test` → `tsx --test src/game/*.test.ts`). No new dependencies.

## Test coverage added

**Engine (`logic.test.ts`)**
- **Kill cycle** — full matrix: each piece kills exactly its prey
  (Monkey→Bat→Butterfly→Ant→Elephant→Lion) and nothing else; Lion kills any.
- **Lion** — one-step orthogonal movement; throne step = win; kill-any
  capture of an adjacent enemy lion wins.
- **Elephant** — 2-HP behaviour (first hit damages + bounce, second kills);
  cooldown gating (on cooldown: can move, can't attack; off cooldown: can);
  cooldown is set by an attack (lands at 1 after the same-turn decrement).
- **Bat** — paralyses a non-bat enemy, links `paralyzing`/`paralyzedBy`, and
  the paralysed piece has zero legal moves.
- **Butterfly** — shields an own piece (mutual link); an attack on the
  shielded stack kills the butterfly, the protected piece survives, attacker
  bounces.
- **Monkey** — jumps over an own piece and kills a bat beyond it; the
  jumped-over piece is untouched.
- **Ant** — 3-cell body slide up a column (range ≤ 4); rotation set on an
  open square is exactly the three non-current orientations; rotation blocked
  when a rotated body cell is occupied.
- **Blockers** — barrier squares and enemy ant wings block movement.
- **Turn/state** — normal move flips the player, increments `turn`, appends a
  history snapshot; an unknown piece id is a no-op (same state reference);
  history snapshots are deep copies that survive later live mutation.

**AI (`ai.test.ts`)**
- Every difficulty (`butterfly`/`monkey`/`lion`) returns a legal,
  well-formed move on the opening (move validated against `getValidMoves`;
  `rotateTo`, if present, is a real orientation).
- Returns `null` for a finished game and when it isn't the AI's turn.
- Takes an obvious immediate win (unique-best lion-to-throne) at every level.
- Noise-free level (`monkey`) is deterministic across repeated calls on a
  unique-best position.
- Chosen move stays legal across many randomized opening picks (exercises the
  tie-break/noise paths without depending on a specific choice).

**Online layer (`onlineActions.test.ts`, extended)**
- `applyOnlineAction` produces exactly what a direct `applyMove` does for a
  legal move (pieces, currentPlayer, turn).
- A move the engine rejects is also rejected (`400`) by `onlineActions`.
- A winning capture's `phase:'won'`/`winner` transition propagates through
  `applyOnlineAction`.

## Intentionally NOT tested yet (deferred, out of scope)

- **Monkey lunge bounce** when killing a bat that was *paralysing* a piece
  (the step-back landing search) — the simple bat-kill is covered; the
  paralysing-stack variant is a deeper combat path left for a follow-up.
- **Lunge-through-own-bat** combat and **monkey landing walk-back** edge
  cases.
- **Clock arithmetic** beyond the existing timeout-expiry tests (Fischer
  increment, per-move cap math in `tickClockOnTurnFlip`).
- **AI strength / quality** — tests assert legality and forced-win, not
  playing strength or depth reached (timing-dependent, would be flaky).
- **React hooks / UI** (`useOnlineGame`, components) and **Supabase
  integration** (route handler + RLS) — covered by the manual SQL + browser
  checklists in `SERVER_AUTHORITATIVE_MOVES_REPORT.md`, not unit tests.
- **Route-level auth/concurrency** (participant check, `expectTurn`/
  `match_number` guards) — enforced in the route/DB, not the pure layer.

## CI

`.github/workflows/ci.yml` runs on `pull_request` and pushes to `main`:

1. `actions/checkout@v4`
2. `actions/setup-node@v4` — Node 20 (repo has no `.nvmrc`/`engines` pin), npm cache
3. `npm ci`
4. `npm run typecheck` (`tsc --noEmit`, strict)
5. `npm test` (`tsx --test src/game/*.test.ts`)
6. `npm run build` (`next build`) — with PUBLIC placeholder Supabase env
   vars so the lazy browser client never trips; **no secrets required**.

**Lint:** there is no `lint` script and no ESLint config in this repo, so the
workflow has **no lint step** (documented inline in the YAML). Nothing to run.

## Discovered engine issues

**None.** Every rule behaved as the tests expected; all positions were
verified against the live engine before being committed. No engine or
game-rule changes were made.

## Validation results

- `npm run typecheck` — **passes** (`tsc --noEmit`, strict; includes the new
  test files and helpers).
- `npm test` — **passes, 52/52** across `logic.test.ts` (20), `ai.test.ts`
  (6), `onlineActions.test.ts` (20), and `puzzleValidator.test.ts` (6).
- `npm run build` — **passes** (`next build`).
- `npm run lint` — **not configured** (no script, no ESLint config).
