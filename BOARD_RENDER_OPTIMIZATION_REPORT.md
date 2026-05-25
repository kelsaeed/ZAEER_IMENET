# Board render optimization (stage 2)

Follow-up to the perf pass in commit 4e822d6 (which removed framer-motion from
`PieceDisplay`). This stage targets the **re-render fan-out**: selecting or
moving one piece used to re-render all 256 `BoardCell`s even when only a
handful changed. Goal was to cut that with **zero visual, rule, or
interaction change**.

## Previous bottleneck / what caused the fan-out

`GameBoard` passed three props to every cell that changed on a selection:

- `selectedPieceId: string | null` — changes on every select/deselect (a
  primitive, but it changed for *all* 256 cells, so all re-rendered).
- `validMoves: Position[]` — a **fresh array reference** every state update.
- `onClick` — for the online board this was `useOnlineGame.clickCell`, whose
  `useCallback` deps include `state`, so its identity changed on **every**
  state update — defeating `React.memo` entirely online.

Each cell also recomputed `getPiecesAtCell` (a filter over all pieces) on
every render — O(256 × pieces). Net result: one selection = 256 re-renders +
256 piece-filter scans, even though only the selected cell and the ~10
valid-move cells actually change.

## Files changed

| File | Change |
| --- | --- |
| `src/game/boardLayout.ts` | **New.** Pure helpers shared by GameBoard + BoardCell: `cellKey`, `buildCellPieceMap`, `pickMainPiece`, `pickOverlayPiece`, `buildValidMoveSet`, and a frozen `NO_PIECES`. No React — unit-tested. |
| `src/components/GameBoard.tsx` | Builds `cellPieceMap` (memo on `pieces`) and `validMoveSet` (memo on `validMoves`) once per render; wraps `onCellClick` in a ref so each cell gets a **stable** click identity; passes per-cell **primitives** (`isSelected`, `isValidMove`) + a **stable** `piecesHere` reference. Dev-only per-commit render-count log behind the perf flag. |
| `src/components/BoardCell.tsx` | Props are now `piecesHere` / `isSelected` / `isValidMove` (was `allPieces` / `selectedPieceId` / `validMoves`). Derives main/overlay piece via the shared `pickMainPiece`/`pickOverlayPiece`. **All visual computation is byte-for-byte the same** — only the inputs were stabilized. Dev render tally via `bumpCellRender`. |
| `src/components/boardRenderCount.ts` | **New.** Dev-only render counter, gated on `localStorage 'zaeer.perf'`. No-op (and zero cost) when off. |
| `src/game/boardLayout.test.ts` | **New.** 8 unit tests for the helpers. |

## How the memoization works

- **`cellPieceMap`** is memoized on `pieces`. A *selection* changes
  `selectedPieceId`/`validMoves` but **not** `pieces`, so the map (and every
  cell's `piecesHere` array reference) stays identical across a selection.
  Empty cells all share the frozen `NO_PIECES` reference. A *move* changes
  `pieces`, so the map rebuilds and the cells whose contents changed get new
  references and re-render — correct.
- **`validMoveSet`** is memoized on `validMoves`; cells receive a boolean
  `isValidMove`, so only cells whose dot appears/disappears change.
- **`isSelected`** is computed in `GameBoard` from the *same* `pickMainPiece`
  rule `BoardCell` uses, so it equals the old `selectedPieceId === mainPiece.id`
  exactly — only the previously- and newly-selected cells flip.
- **`stableClick`** (a `useRef` + `useCallback([])` wrapper) gives every cell a
  click handler whose identity never changes, even when the caller's handler
  doesn't (online). This is what makes `React.memo` effective on the online
  board.

Every `BoardCell` prop is now a primitive, a stable callback, or a stable
reference, so **React.memo's default shallow compare is sufficient** — no
custom comparator was needed (lower risk, easier to review). Net effect: a
selection re-renders ~2 (selection flip) + ~N (valid-move) cells instead of
256; a move re-renders only the cells whose pieces changed.

## Visual-risk areas — preserved exactly

- **Selected glow/ring:** `isSelected` is computed from the identical
  main-piece rule; the selected ant's wing cells compute the same value they
  did before (and the wing branch ignores it visually anyway).
- **Valid-move dots vs attack squares:** `BoardCell` still owns the
  move-vs-attack decision (`isValidMove && piecesHere.length > 0`) — unchanged.
- **Butterfly shield / bat overlay:** `pickMainPiece`/`pickOverlayPiece` are
  the same find rules; a selected *overlay* still yields `isSelected = false`
  on its cell's main piece, as before.
- **Ant body + wings:** `buildCellPieceMap` reproduces `getPiecesAtCell`
  (ant occupies centre + wings), so wing cells still resolve to the ant and
  render the wing marker; rotation/`canRotate` UI lives in the HUD, untouched.
- **Throne / barrier / cell labels / themes:** computed in `BoardCell` from
  `row`/`col`/context exactly as before; theme changes still re-render all
  cells (correct).
- **RTL:** the board container stays `dir="ltr"`; no layout/positioning
  changed.
- **reduced-motion:** unchanged (no animation logic touched).

## How to manually test

Enable the meters first: in the console run
`localStorage.setItem('zaeer.perf','1')` and reload. You get the bottom-left
FPS overlay **and** a `[board] commit #N: X / 256 cells rendered` line in the
console on each board commit. Selecting a piece should now log a small `X`
(roughly: 1–2 + the number of valid-move squares), not 256. Remove with
`localStorage.removeItem('zaeer.perf')`.

Checklist:

- [ ] **Main menu** still smooth.
- [ ] **Tutorial** board interactions work; **all 19 lessons** still complete
      (covered by `tutorial.test.ts`).
- [ ] **Offline** select/move feels instant; the console shows a small
      rendered-cell count on select.
- [ ] **Valid-move dots** appear/disappear correctly.
- [ ] **Attack squares** (square red marker on an enemy target) render.
- [ ] **Selected piece glow** works.
- [ ] **Butterfly shield / overlay** still wiggles and protects.
- [ ] **Ant body + rotation** UI still works.
- [ ] **Throne & barriers** render correctly.
- [ ] **Online** legal move syncs; **ant move + rotate + End Turn** works;
      cells re-render minimally on the opponent's move.
- [ ] **Arabic/RTL** board chrome correct.
- [ ] **reduced-motion** still disables continuous effects.

## Validation

- `npm run typecheck` — **passes** (`tsc --noEmit`, strict).
- `npm test` — **passes, 94/94** (+8 `boardLayout` tests; engine/AI/tutorial/
  online/rate-limit suites unaffected).
- `npm run build` — **passes** (`next build`; route sizes unchanged).
- `npm run lint` — **not configured** (no `lint` script, no ESLint config).

## Remaining performance follow-ups

- **`bounceEffect` prop** is still passed to all cells; when it transitions
  (set → cleared after ~0.5s) it re-renders all cells twice. This coincides
  with a move (which re-renders all cells anyway), so the marginal cost is
  nil — left as-is for simplicity. Could be scoped to the bouncing cell only
  if ever needed.
- **Per-cell gradient strings** (multi-stop `color-mix`) are rebuilt when a
  cell renders; paint is cached by the browser when the string is unchanged.
  Fine now that re-renders are scoped, but could be memoized per
  (theme, throne/barrier, isEven) if a profiler ever flags it.
- **AI on a Web Worker**, **timeout liveness**, bundle trimming — unchanged,
  tracked separately.
