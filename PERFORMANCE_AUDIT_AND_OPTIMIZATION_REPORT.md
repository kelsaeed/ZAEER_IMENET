# Performance audit & optimization

Goal: make the whole app feel smooth — menu, tutorial, offline, online, and
navigation — on a normal PC, without changing the premium look, gameplay
rules, server-authoritative online moves, tutorial behavior/tests, or RTL.

## Symptoms addressed

- General lag / low input responsiveness across the main menu, tutorial,
  offline game, online game, and navigation.

## Likely root causes found

The codebase had already been through perf passes (the `SettingsProvider`
context value is memoized, `BoardCell` is `memo`'d, `useGame` callbacks are
stable, several decorations are CSS instead of framer-motion, the celestial
decor is mobile-gated). Two real hot spots remained:

1. **`PieceDisplay` wrapped every board piece in a framer-motion
   `<motion.div>`** (plus `motion.span` overlays and `motion.div` ant wings).
   A full board is ~24 pieces → ~24+ motion nodes, each subscribed to
   framer's animation loop and **re-diffed on every board re-render**. The
   board re-renders all 256 cells on every selection, so each select/move
   churned the entire framer motion tree. The board is shared by **offline,
   online, and tutorial** — which is exactly the set of laggy surfaces.
   *This was the dominant board-interaction cost.*

2. **`AnimatedBackground` (main menu)** ran a 60fps rAF loop that painted 18
   colour-emoji glyphs with `fillText` **every frame** (emoji glyph
   rasterization is expensive), plus O(n²) collision work, and never paused
   when the tab was hidden. The main continuous cost on the menu.

Ruled out as universal causes: `SettingsProvider` (value already memoized),
`ThemeDecor`/`BoardDecor` (celestial-only + mobile-gated), realtime
subscriptions (deferred 1.5s, event-driven, not per-frame), per-cell
`color-mix` gradients (paint is one-time; the style string is stable across
re-renders).

## Files changed

| File | Change |
| --- | --- |
| `src/components/PieceDisplay.tsx` | Removed framer-motion entirely. Idle pieces are now plain `<div>`s; the selected pulse, overlay wiggle, and attack bounce are pure-CSS keyframes. Bounce vector is passed to the keyframe via `--zi-bx`/`--zi-by` custom properties. **Visually identical.** |
| `src/app/globals.css` | Added `zi-piece-pulse`, `zi-piece-bounce`, `zi-overlay-wiggle` keyframes (matching the old framer targets) + a `prefers-reduced-motion` block that disables them. |
| `src/components/AnimatedBackground.tsx` | Pre-rasterize each emoji to an offscreen sprite once and `drawImage` per frame (instead of per-frame `fillText`); cap the sim at ~30fps; pause the rAF loop while the tab is hidden. **Visually identical.** |
| `src/components/PerfOverlay.tsx` | **New.** Dev/flag-gated FPS + worst-frame overlay for measuring smoothness. Off by default, zero cost unless enabled. |
| `src/app/layout.tsx` | Mount `<PerfOverlay/>` (no-op unless the flag is set). |

## Optimizations implemented

1. **Framer-motion off the board hot path.** The three piece animations are
   now GPU-driven CSS keyframes. Net effect:
   - Idle pieces render as plain divs — board re-renders (which happen on
     every selection/move) are dramatically cheaper.
   - CSS animations never restart on a React re-render (the old framer
     inline-object targets did — the source of prior piece "flicker").
   - framer-motion is no longer instantiated 24× per board.
2. **Cheaper menu canvas.** Sprite-cached emoji + 30fps + tab-hidden pause
   roughly quarters the menu background's per-frame cost while looking the
   same. Already respects `prefers-reduced-motion` (renders nothing).
3. **Measurement aid.** `PerfOverlay` lets you read live FPS/worst-frame to
   verify before/after (enable with `localStorage.setItem('zaeer.perf','1')`).

## Reduced-motion / accessibility

- The new piece keyframes are disabled under `@media (prefers-reduced-motion:
  reduce)`, consistent with the existing decoration rules.
- `AnimatedBackground` already short-circuits to nothing under reduced motion.

## What was intentionally NOT changed

- **`BoardCell` prop contract / selection re-render fan-out.** All 256 cells
  still re-render on selection (the `validMoves` array + `selectedPieceId`
  change for all). With pieces now plain divs this is cheap, and the
  selection/overlay/shield visual logic in `BoardCell` is subtle — rewriting
  it to pass per-cell booleans risked visual regressions for low marginal
  gain. Left as a documented follow-up.
- **Celestial decor** (`ThemeDecor`/`BoardDecor`) — already mobile-gated and
  only active on that theme; the premium look is preserved as-is.
- **No gameplay, engine, online-auth, Supabase schema, tutorial, or RTL
  changes.**
- **No "performance mode" toggle** was wired (see follow-ups) — the two core
  fixes are quality-preserving and target the actual bottlenecks, so a
  quality-reducing mode wasn't needed as the primary fix.

## Before / after expectations

- **Offline / online / tutorial board:** selecting and moving pieces should
  feel immediate; no per-piece framer churn on each board re-render. The
  selected-piece pulse, attack bounce, and shield/paralyze overlay wiggle
  look the same.
- **Main menu:** the floating-emoji background costs ~¼ of its previous
  per-frame work and pauses when the tab is backgrounded; the menu should
  feel lighter, especially alongside the entrance animations.
- **Navigation:** destination pages that mount the board no longer drag in a
  per-piece framer tree, so route transitions into a game/tutorial settle
  faster.
- No visual differences should be perceptible.

## Remaining performance follow-ups

- **BoardCell re-render fan-out:** pass per-cell `isValidMove` / `isSelected`
  booleans (via memoized lookups in `GameBoard`) so `memo` can skip cells
  whose state didn't change — cutting ~256 re-renders per selection to the
  ~2–20 that actually change. Deferred for the visual-regression risk noted
  above; safe to do behind careful testing of the shield/overlay selection.
- **Optional user-facing "performance mode":** a persisted `perfMode` setting
  that adds a `data-perf` attribute on `<html>`; CSS would then disable the
  celestial overlay layers and the menu canvas (reuse the reduced-motion
  rules). Simple and valuable for low-end machines, but it touches
  `SettingsProvider` + `SettingsPanel` (UI), so it's scoped out of this
  low-risk pass.
- **AI on a Web Worker:** the Lion (hard) AI runs an up-to-1.8s search on the
  main thread (offline only). It's already time-boxed and off the human's
  turn, but moving it to a worker would remove any chance of a hitch during
  the bot's "thinking" window. Larger change — separate task.
- **Bundle:** framer-motion is still shared across menu/win/store screens;
  a pass to trim or lazy-load it further could shave the shared chunk.

## Validation

- `npm run typecheck` — **passes** (`tsc --noEmit`, strict).
- `npm test` — **passes, 86/86** (engine/AI/tutorial/online/rate-limit
  suites unaffected).
- `npm run build` — **passes** (`next build`; all routes compile, sizes
  unchanged within rounding).
- `npm run lint` — **not configured** (no `lint` script, no ESLint config).

## Manual browser test checklist

Enable the FPS meter first: in the console run
`localStorage.setItem('zaeer.perf','1')` and reload; watch the bottom-left
`fps · worst Nms` readout during each step. Remove the flag when done.

- [ ] **Main menu** — hover/click the hero buttons; the floating-emoji
      background drifts smoothly; backgrounding the tab pauses it (fps reads
      0 work) and it resumes cleanly on return.
- [ ] **Navigate to tutorial** — route transition feels prompt.
- [ ] **Tutorial lesson interaction** — tap-to-move lessons, ant
      move+rotate+End Turn, and the pulse/highlight all behave as before;
      all 19 lessons still present.
- [ ] **Offline game** — select a piece (selected pulse animates), move it
      (instant), trigger an attack (bounce animation plays toward the
      target), shield a piece (butterfly overlay wiggles).
- [ ] **Offline AI turn** — bot moves after its think delay without freezing
      input afterward.
- [ ] **Online room join** — board renders smoothly for both players.
- [ ] **Online legal move** — lands promptly; opponent sees it via realtime.
- [ ] **Online ant move + rotate + End Turn** — commits correctly.
- [ ] **Chat / reactions** (if used) — flying emoji reactions unaffected
      (already CSS).
- [ ] **Arabic / RTL toggle** — board still renders LTR internally; page text
      mirrors; no overlay misalignment.
- [ ] **Reduced motion** — with OS "reduce motion" on, piece pulse/bounce/
      wiggle and the menu canvas are disabled; gameplay still fully works.
