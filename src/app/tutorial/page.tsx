'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';
import { applyMove, getValidMoves } from '@/game/logic';
import type { GameState } from '@/game/types';
import { TUTORIAL_STEPS, tutorialState } from '@/game/tutorial';
import KillCycleWheel from '@/components/KillCycleWheel';
import GameBoard from '@/components/GameBoard';

type Phase =
  | { kind: 'wheel' }
  | { kind: 'lesson'; index: number; state: GameState; done: boolean }
  | { kind: 'end' };

/** Interactive tutorial. First step is the kill-cycle wheel; the rest
 *  are guided board moves with the click logic locked to the lesson.
 *  The end screen funnels the player into a real game vs the easy AI
 *  so they can practise everything they just learned. */
export default function TutorialPage() {
  const router = useRouter();
  const { theme, isRTL, t } = useSettings();
  const [phase, setPhase] = useState<Phase>({ kind: 'wheel' });
  const [shake, setShake] = useState(0);
  const [cellSize, setCellSize] = useState(34);

  // Mark tutorial-seen so the home-page first-load toast doesn't keep
  // pestering returning users.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('zaeer.tutorialSeen', '1'); } catch { /* ignore */ }
    }
  }, []);

  // Responsive board sizing — the lesson UI is meant to fit in a single
  // viewport without scrolling, so we calculate the largest cell size
  // that leaves enough room for the top header (~120px) and the bottom
  // controls (~80px). Re-runs on resize via RAF throttle.
  useEffect(() => {
    function calc() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const padX = vw < 480 ? 8 : 24;
      const reserveTop = 130;     // top header bar with body card
      const reserveBottom = 80;   // step counter + skip + next
      // Board + half-cell row labels: 16.5 cellSizes wide, 16 + label tall.
      const maxFromW = Math.floor((vw - padX * 2) / 16.6);
      const maxFromH = Math.floor((vh - reserveTop - reserveBottom) / 16.5);
      setCellSize(Math.max(12, Math.min(40, maxFromW, maxFromH)));
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
  // Each lesson defines exactly two clicks: select-from then move-to.
  // Anything else triggers a soft horizontal shake on the body card so
  // the player feels the bounce without the page going haywire.
  function handleCellClick(row: number, col: number) {
    if (phase.kind !== 'lesson' || phase.done) return;
    const step = TUTORIAL_STEPS[phase.index];
    const s = phase.state;

    if (!s.selectedPieceId) {
      if (row !== step.selectFrom.row || col !== step.selectFrom.col) {
        setShake(n => n + 1);
        return;
      }
      const myPiece = s.pieces.find(p => p.row === row && p.col === col && p.player === s.currentPlayer);
      if (!myPiece) { setShake(n => n + 1); return; }
      const { moves, canRotate, validRotations } = getValidMoves(myPiece, s.pieces);
      // Limit visible "valid moves" to JUST the lesson destination so the
      // board doesn't light up with off-script options.
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

    if (row !== step.moveTo.row || col !== step.moveTo.col) {
      // Re-tapping the lesson piece is fine (it stays selected); shake
      // any other click.
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
      className="px-3 py-3 sm:py-4 flex flex-col items-center"
      style={{ background: theme.bgGradient, color: theme.textPrimary, minHeight: '100dvh' }}
    >
      {/* WHEEL phase */}
      {phase.kind === 'wheel' && (
        <>
          <div className="w-full max-w-3xl flex items-center justify-between mb-3">
            <Link href="/" className="text-sm opacity-70 hover:opacity-100">← {t('win.mainMenu')}</Link>
            <button
              type="button"
              onClick={skipAll}
              className="text-xs opacity-60 hover:opacity-100 px-3 py-1.5 rounded-lg"
              style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, color: theme.textPrimary }}
            >
              {t('tutorial.skipAll')}
            </button>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl flex flex-col items-center gap-3"
          >
            <h1 className="text-2xl sm:text-3xl font-extrabold text-center" style={{ color: theme.p1Color }}>
              {t('tutorial.wheelTitle')}
            </h1>
            <p className="text-sm opacity-80 text-center max-w-md">{t('tutorial.wheelBody')}</p>
            <KillCycleWheel />
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
        </>
      )}

      {/* LESSON phase: 3-column header (back / body / skip) so the body
          card lives at the top with the navigation rather than below
          the board. Keeps everything above the fold on common laptops. */}
      {phase.kind === 'lesson' && (
        <div className="w-full max-w-5xl flex flex-col items-center gap-3">
          <div className="w-full grid grid-cols-[auto_1fr_auto] items-start gap-3">
            <Link
              href="/"
              className="text-sm opacity-70 hover:opacity-100 mt-1 whitespace-nowrap"
            >
              ← {t('win.mainMenu')}
            </Link>

            <motion.div
              key={`step-${phase.index}-${shake}`}
              initial={{ x: 0 }}
              animate={shake > 0 ? { x: [-6, 6, -4, 4, 0] } : { x: 0 }}
              transition={{ duration: 0.32 }}
              className="rounded-2xl px-3 py-2 text-center"
              style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
            >
              <div className="text-sm sm:text-base font-extrabold" style={{ color: theme.p1Color }}>
                {t(TUTORIAL_STEPS[phase.index].titleKey)}
              </div>
              <div className="text-xs sm:text-sm opacity-85 mt-0.5">
                {phase.done
                  ? t(TUTORIAL_STEPS[phase.index].doneKey)
                  : t(TUTORIAL_STEPS[phase.index].bodyKey)}
              </div>
            </motion.div>

            <button
              type="button"
              onClick={skipAll}
              className="text-xs opacity-60 hover:opacity-100 px-3 py-1.5 rounded-lg whitespace-nowrap mt-1"
              style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, color: theme.textPrimary }}
            >
              {t('tutorial.skipAll')}
            </button>
          </div>

          <GameBoard
            state={phase.state}
            cellSize={cellSize}
            onCellClick={handleCellClick}
            tutorialHighlight={
              phase.done || phase.state.selectedPieceId
                ? null
                : TUTORIAL_STEPS[phase.index].selectFrom
            }
          />

          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs opacity-60">
              {t('tutorial.stepCounter')
                .replace('{n}', String(phase.index + 1))
                .replace('{total}', String(TUTORIAL_STEPS.length))}
            </span>
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
          </div>
        </div>
      )}

      {/* END phase */}
      {phase.kind === 'end' && (
        <>
          <div className="w-full max-w-md flex items-center justify-between mb-4">
            <Link href="/" className="text-sm opacity-70 hover:opacity-100">← {t('win.mainMenu')}</Link>
          </div>
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
            <Link href="/" className="text-sm opacity-65 hover:opacity-100">
              {t('tutorial.endHome')}
            </Link>
          </motion.div>
        </>
      )}
    </main>
  );
}
