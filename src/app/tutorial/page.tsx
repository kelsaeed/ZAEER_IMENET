'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';
import { applyMove, getValidMoves } from '@/game/logic';
import type { GameState } from '@/game/types';
import { TUTORIAL_STEPS, tutorialState } from '@/game/tutorial';
import KillCycleWheel, { PIECES_FOR_BODY, WedgeKey } from '@/components/KillCycleWheel';
import GameBoard from '@/components/GameBoard';

type Phase =
  | { kind: 'wheel' }
  | { kind: 'lesson'; index: number; state: GameState; done: boolean }
  | { kind: 'end' };

/** Interactive tutorial. First step is the kill-cycle wheel; the next
 *  four are guided board moves with the click logic locked to the
 *  lesson. The end screen funnels the player into a real game vs the
 *  easy AI so they can practise everything they just learned. */
export default function TutorialPage() {
  const router = useRouter();
  const { theme, isRTL, t } = useSettings();
  const [phase, setPhase] = useState<Phase>({ kind: 'wheel' });
  const [wheelPick, setWheelPick] = useState<WedgeKey | 'lion' | null>('lion');
  const [shake, setShake] = useState(0);
  const [cellSize, setCellSize] = useState(38);

  // Mark "tutorial seen" so the home-page first-load toast doesn't keep
  // pestering returning users — we set this on tutorial entry, not at
  // completion, so even a quick peek counts as "seen".
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('zaeer.tutorialSeen', '1'); } catch { /* ignore */ }
    }
  }, []);

  // Responsive board sizing — same idea as the home page, scaled down a
  // bit so the body text + buttons stay above the fold on common laptops.
  useEffect(() => {
    function calc() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const padX = vw < 480 ? 8 : 24;
      const reserveBottom = 220; // body text + buttons under the board
      const maxFromW = Math.floor((vw - padX * 2) / 16.6);
      const maxFromH = Math.floor((vh - reserveBottom) / 16.6);
      setCellSize(Math.max(14, Math.min(46, maxFromW, maxFromH)));
    }
    let raf = 0;
    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; calc(); });
    }
    calc();
    window.addEventListener('resize', schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  function startLessons() {
    setPhase({ kind: 'lesson', index: 0, state: tutorialState(TUTORIAL_STEPS[0].pieces), done: false });
  }

  function advance() {
    if (phase.kind !== 'lesson') return;
    const next = phase.index + 1;
    if (next >= TUTORIAL_STEPS.length) {
      setPhase({ kind: 'end' });
      return;
    }
    setPhase({
      kind: 'lesson',
      index: next,
      state: tutorialState(TUTORIAL_STEPS[next].pieces),
      done: false,
    });
  }

  function skipAll() {
    setPhase({ kind: 'end' });
  }

  // ── Locked click handler ─────────────────────────────────────────
  // The lesson defines exactly two clicks: select-from then move-to.
  // Every other click is rejected with a small shake on the body card so
  // the player feels the bounce without the page going haywire.
  function handleCellClick(row: number, col: number) {
    if (phase.kind !== 'lesson' || phase.done) return;
    const step = TUTORIAL_STEPS[phase.index];
    const s = phase.state;

    // First click: must be the lesson's selectFrom cell. If correct, we
    // arm the validMoves overlay so the GameBoard highlights the
    // destination square the same way it does in a normal game.
    if (!s.selectedPieceId) {
      if (row !== step.selectFrom.row || col !== step.selectFrom.col) {
        setShake(n => n + 1);
        return;
      }
      const myPiece = s.pieces.find(p => p.row === row && p.col === col && p.player === s.currentPlayer);
      if (!myPiece) { setShake(n => n + 1); return; }
      const { moves, canRotate, validRotations } = getValidMoves(myPiece, s.pieces);
      // Limit the visible "valid moves" to JUST the lesson destination so
      // the board doesn't light up with options that aren't on-script.
      const limited = moves.filter(m => m.row === step.moveTo.row && m.col === step.moveTo.col);
      setPhase({
        ...phase,
        state: {
          ...s,
          selectedPieceId: myPiece.id,
          validMoves: limited,
          canRotate,
          validRotations,
        },
      });
      return;
    }

    // Second click: must be the moveTo cell.
    if (row !== step.moveTo.row || col !== step.moveTo.col) {
      // Tap a different friendly piece? Allow re-selecting it back to the
      // lesson piece (cheap escape hatch), otherwise just shake.
      if (row === step.selectFrom.row && col === step.selectFrom.col) return;
      setShake(n => n + 1);
      return;
    }

    const next = applyMove(s, s.selectedPieceId, row, col);
    const done = step.isComplete(next);
    setPhase({ ...phase, state: next, done });
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <main
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen px-3 py-6 sm:py-10 flex flex-col items-center"
      style={{ background: theme.bgGradient, color: theme.textPrimary, minHeight: '100dvh' }}
    >
      {/* Top bar */}
      <div className="w-full max-w-5xl flex items-center justify-between mb-4">
        <Link href="/" className="text-sm opacity-70 hover:opacity-100">← {t('win.mainMenu')}</Link>
        {phase.kind !== 'end' && (
          <button
            type="button"
            onClick={skipAll}
            className="text-xs opacity-60 hover:opacity-100 px-3 py-1.5 rounded-lg"
            style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, color: theme.textPrimary }}
          >
            {t('tutorial.skipAll')}
          </button>
        )}
      </div>

      {/* WHEEL phase */}
      {phase.kind === 'wheel' && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-2xl flex flex-col items-center gap-4"
        >
          <h1 className="text-2xl sm:text-3xl font-extrabold text-center" style={{ color: theme.p1Color }}>
            {t('tutorial.wheelTitle')}
          </h1>
          <p className="text-sm opacity-80 text-center max-w-md">{t('tutorial.wheelBody')}</p>
          <KillCycleWheel onPick={setWheelPick} selected={wheelPick} />
          <div
            className="rounded-xl px-4 py-3 text-center text-sm min-h-[3.5rem] flex items-center justify-center max-w-md w-full"
            style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
          >
            {(() => {
              const entry = PIECES_FOR_BODY.find(e => e.key === wheelPick) ?? PIECES_FOR_BODY[0];
              return t(entry.bodyKey);
            })()}
          </div>
          <button
            type="button"
            onClick={startLessons}
            className="rounded-2xl px-6 py-3 text-base font-extrabold transition-transform hover:scale-105 active:scale-95"
            style={{
              background: `linear-gradient(to right, ${theme.p1Color}, ${theme.selectedRing}, ${theme.p1Color})`,
              color: '#000',
              boxShadow: `0 0 24px ${theme.p1Color}80`,
            }}
          >
            {t('tutorial.wheelGotIt')} →
          </button>
        </motion.div>
      )}

      {/* LESSON phase */}
      {phase.kind === 'lesson' && (
        <div className="w-full flex flex-col items-center gap-3 max-w-5xl">
          <div className="w-full flex items-center justify-between text-xs opacity-65">
            <span>{t('tutorial.stepCounter').replace('{n}', String(phase.index + 1)).replace('{total}', String(TUTORIAL_STEPS.length))}</span>
          </div>

          <motion.div
            key={`step-${phase.index}-${shake}`}
            initial={{ x: 0 }}
            animate={shake > 0 ? { x: [-6, 6, -4, 4, 0] } : { x: 0 }}
            transition={{ duration: 0.35 }}
            className="rounded-2xl p-3 text-center max-w-xl w-full"
            style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
          >
            <div className="text-base font-extrabold mb-1" style={{ color: theme.p1Color }}>
              {t(TUTORIAL_STEPS[phase.index].titleKey)}
            </div>
            <div className="text-sm opacity-85">
              {phase.done
                ? t(TUTORIAL_STEPS[phase.index].doneKey)
                : t(TUTORIAL_STEPS[phase.index].bodyKey)}
            </div>
          </motion.div>

          <div
            className="relative inline-block"
            style={{ width: cellSize * 16.5 }}
          >
            <GameBoard
              state={phase.state}
              cellSize={cellSize}
              onCellClick={handleCellClick}
            />
            {/* Hint pulse on the cell the player should click first.
                Hidden once a piece is selected (valid-move highlights
                already point to the destination). Coordinates are
                relative to the GameBoard's grid: column labels take
                one row's worth of height at the top, and row labels
                take half a cell of width on the leading edge. */}
            {!phase.state.selectedPieceId && (
              <HintPulse
                row={TUTORIAL_STEPS[phase.index].selectFrom.row}
                col={TUTORIAL_STEPS[phase.index].selectFrom.col}
                cellSize={cellSize}
                color={theme.p1Color}
              />
            )}
          </div>

          <div className="flex items-center gap-3 mt-1">
            <button
              type="button"
              onClick={advance}
              className="text-xs opacity-65 hover:opacity-100 px-3 py-2 rounded-lg"
              style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, color: theme.textPrimary }}
            >
              {t('tutorial.skip')}
            </button>
            {phase.done && (
              <motion.button
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={advance}
                className="rounded-xl px-5 py-2.5 text-sm font-extrabold transition-transform hover:scale-105"
                style={{
                  background: theme.buttonRotateBg,
                  border: `1px solid ${theme.buttonRotateBorder}`,
                  color: theme.buttonRotateText,
                  boxShadow: `0 0 18px ${theme.p1Color}80`,
                }}
              >
                {t('tutorial.next')}
              </motion.button>
            )}
            {!phase.done && phase.state.selectedPieceId === null && (
              <span className="text-xs opacity-60">{/* hint already in body card */}</span>
            )}
          </div>
        </div>
      )}

      {/* END phase */}
      {phase.kind === 'end' && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md flex flex-col items-center gap-4 mt-8"
        >
          <div className="text-5xl mb-1" aria-hidden>🎉</div>
          <h1 className="text-2xl font-extrabold text-center" style={{ color: theme.p1Color }}>
            {t('tutorial.endTitle')}
          </h1>
          <p className="text-sm opacity-80 text-center">{t('tutorial.endBody')}</p>
          <button
            type="button"
            onClick={() => router.push('/?ai=easy')}
            className="rounded-2xl w-full px-6 py-3 text-base font-extrabold transition-transform hover:scale-105 active:scale-95"
            style={{
              background: `linear-gradient(to right, ${theme.p1Color}, ${theme.selectedRing}, ${theme.p1Color})`,
              color: '#000',
              boxShadow: `0 0 24px ${theme.p1Color}80`,
            }}
          >
            {t('tutorial.endTryAi')}
          </button>
          <Link
            href="/"
            className="text-sm opacity-65 hover:opacity-100"
          >
            {t('tutorial.endHome')}
          </Link>
        </motion.div>
      )}
    </main>
  );
}

/** Pulsing ring overlay drawn on top of the GameBoard cell at (row, col).
 *  GameBoard is laid out as: column-labels row (height = cellSize) +
 *  N grid rows. Each grid row has a leading row-label of width 0.5 * cellSize.
 *  So the cell rect's top-left within the GameBoard wrapper is:
 *    top  = cellSize + row * cellSize
 *    left = 0.5 * cellSize + col * cellSize  (from the start edge of the grid). */
function HintPulse({ row, col, cellSize, color }: { row: number; col: number; cellSize: number; color: string }) {
  // Skip rendering when the board is too small to be useful (mobile
  // edge case where cellSize might be tiny and the pulse would just be noise).
  if (cellSize < 16) return null;
  return (
    <motion.div
      aria-hidden
      animate={{ scale: [1, 1.12, 1], opacity: [0.95, 0.55, 0.95] }}
      transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
      className="absolute pointer-events-none rounded-md"
      style={{
        top: cellSize + row * cellSize,
        left: 0.5 * cellSize + col * cellSize,
        width: cellSize,
        height: cellSize,
        boxSizing: 'border-box',
        border: `3px solid ${color}`,
        boxShadow: `0 0 22px ${color}, inset 0 0 22px ${color}55`,
        zIndex: 5,
      }}
    />
  );
}
