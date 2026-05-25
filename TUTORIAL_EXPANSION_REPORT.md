# Tutorial expansion (19 → 24 lessons)

Adds five high-value lessons for mechanics new players still find confusing,
without removing or weakening any existing lesson. Purely additive: new
entries in the data-driven `TUTORIAL_STEPS` plus English + Arabic copy. No
renderer change, no game-rule change.

## Lessons added

| # | ID | Type | Teaches |
| --- | --- | --- | --- |
| 7 | `barrier` | interactive | The 🌿 barrier squares block every piece and guard the throne. The Elephant slides up and stops one square short of the wall. |
| 9 | `shield-attack` | interactive | Breaking a shield: attacking a Butterfly-shielded Monkey kills the Butterfly (it takes the hit) while the Monkey survives — a shield buys one hit. |
| 21 | `eliminate-lions` | callout | **Each side has TWO Lions** — capturing one isn't a win; you must take both (or reach the throne). Corrects the natural misread from the single-Lion capture lesson. |
| 23 | `clock` | callout | Clocked online games: your clock ticks only on your turn, running out loses on time, and the opponent can claim the win even if you disconnect. |
| 24 | `fair-play` | callout | Online moves are server-verified, so illegal moves are rejected and the board can't be edited — both players see the same position. |

(Numbers are the new positions in the 24-step order.)

### Placement rationale (existing lessons keep their relative order)

- `barrier` sits with the movement cluster (after `monkey-leap`), since it's
  about how board structure limits movement.
- `shield-attack` follows `shield` — shielding offense right after shielding
  defense.
- `eliminate-lions` follows `capture-lion`, immediately correcting "one Lion
  is enough" → "there are two."
- `clock` and `fair-play` are the closing "before you go online" callouts
  after the hands-on `lion-finale` climax.

## Interactive vs callout

- **Interactive** (`barrier`, `shield-attack`): real scripted move paths the
  player performs; verified solvable against the engine (see tests). Both
  include a distant enemy Lion so the engine's "all enemy Lions eliminated"
  win can't fire on the lesson move.
- **Callout** (`eliminate-lions`, `clock`, `fair-play`): conceptual topics
  shown over a static board with a Next button — the existing callout style,
  no new renderer.

## Engine verification

Both interactive lessons were checked against the real engine before writing,
and are continuously guarded by `tutorial.test.ts`, which walks each lesson's
scripted path (select → move → optional rotate → optional End Turn) and asserts
`isComplete` becomes true:

- `barrier`: Elephant (11,7) → (10,7); the engine offers no square past the
  row-9 barrier. Verified it lands and the game stays in progress.
- `shield-attack`: Lion (5,4) attacks the shielded stack at (4,4); engine
  removes the Butterfly, the Monkey survives, the Lion bounces back.

## Test coverage added

`src/game/tutorial.test.ts` already validates every step generically, so the
new lessons are covered automatically:

- **Scripted-path solvability** — new per-lesson tests for `barrier` and
  `shield-attack` (the 3 callouts have nothing to solve).
- **Locale coverage** — the existing test asserts every step's
  title/body/done key resolves in **all** built-in locales (English + Arabic),
  so the 15 new keys (5 lessons × 3) are checked in both languages.
- **Unique IDs** — existing duplicate-id guard covers the 5 new IDs.
- **New:** an explicit test that every interactive (non-callout) lesson
  defines both `isComplete` and `selectFrom`, so a future lesson can't ship
  un-completable or un-startable.

Full suite: **113/113 passing**.

## Files changed

| File | Change |
| --- | --- |
| `src/game/tutorial.ts` | +5 `TutorialStep` definitions; inserted into `TUTORIAL_STEPS` at their pedagogical positions (existing order preserved). |
| `src/game/locales.ts` | +15 English keys and +15 Arabic keys (`tutorial.barrier.*`, `tutorial.shieldAttack.*`, `tutorial.eliminateLions.*`, `tutorial.clock.*`, `tutorial.fairPlay.*`). |
| `src/game/tutorial.test.ts` | +1 test (interactive lessons must define `isComplete`/`selectFrom`); the rest is auto-covered. |

No changes to the renderer, game rules, online/server-authoritative logic,
timeout/rate-limit code, or RTL handling. Arabic copy is natural and
game-appropriate (not literal), reusing the established terminology
(الأسد/الفيل/القرد/الفراشة/الخفاش/النملة, العرش, الحاجز, الدرع).

## Validation

- `npm run typecheck` — **passes** (`tsc --noEmit`, strict).
- `npm test` — **passes, 113/113**.
- `npm run build` — **passes**; `/tutorial` compiles (6.65 kB).
- `npm run lint` — **not configured** (no `lint` script, no ESLint config).

## Remaining tutorial ideas (future)

- **Lunge-through-own-bat:** your own Bat paralyzes an enemy and your attacker
  lunges *through* the Bat to kill the paralyzed piece. Verified legal in the
  engine but the resulting positions (Bat drops, attacker stands adjacent) are
  intricate to present clearly — deferred as a fragile/niche edge case (the
  `rescue` lesson already covers the common Monkey-vs-paralyzing-Bat case).
- **Ant body as a moving obstacle:** routing your own pieces around your Ant's
  wings (partly covered by `ant-defend`, which uses wings defensively).
- **Increment/Fischer detail** on the clock lesson, if clocked play proves
  confusing in practice.
- A two-move "now finish the second Lion" interactive would require the
  renderer to allow consecutive player-1 moves across a turn flip — out of
  scope; the `eliminate-lions` callout conveys the rule instead.
