'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';
import { applyMove, applyEndTurn, getValidMoves } from '@/game/logic';
import type { GameState, Orientation } from '@/game/types';
import { TUTORIAL_STEPS, tutorialState } from '@/game/tutorial';
import KillCycleWheel from '@/components/KillCycleWheel';
import GameBoard from '@/components/GameBoard';
import TutorialTourScene from '@/components/TutorialTourScene';
import SettingsButton from '@/components/SettingsButton';

type Phase =
  | { kind: 'wheel' }
  | { kind: 'lesson'; index: number; state: GameState; done: boolean }
  | { kind: 'end' };

/** Callout steps (the opening UI tour) have nothing to "complete" — the
 *  Next button is available immediately and the body keeps showing the
 *  legend rather than flipping to a done message. */
function initialDone(index: number): boolean {
  return TUTORIAL_STEPS[index].kind === 'callout';
}

/** Interactive tutorial. First step is the kill-cycle wheel, then a
 *  non-interactive UI tour, then guided board lessons with the click
 *  logic locked to each lesson (ant lessons additionally surface the
 *  real rotation / End-Turn controls). The end screen funnels the
 *  player into a real game vs the easy AI. */
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
    setPhase({ kind: 'lesson', index: 0, state: tutorialState(TUTORIAL_STEPS[0].pieces), done: initialDone(0) });
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
      done: initialDone(next),
    });
  }

  function skipAll() {
    setPhase({ kind: 'end' });
  }

  // ── Locked click handler ─────────────────────────────────────────
  // Move lessons define a select-from then a move-to (the move-to is
  // omitted for rotation-only ant lessons — there the only path forward
  // is the side-panel rotation buttons). Callout/tour steps ignore
  // clicks entirely. Anything off-script triggers a soft shake.
  function handleCellClick(row: number, col: number) {
    if (phase.kind !== 'lesson' || phase.done) return;
    const step = TUTORIAL_STEPS[phase.index];
    if (step.kind === 'callout') return;
    const s = phase.state;

    if (!s.selectedPieceId) {
      if (!step.selectFrom || row !== step.selectFrom.row || col !== step.selectFrom.col) {
        setShake(n => n + 1);
        return;
      }
      const myPiece = s.pieces.find(p => p.row === row && p.col === col && p.player === s.currentPlayer);
      if (!myPiece) { setShake(n => n + 1); return; }
      const { moves, canRotate, validRotations } = getValidMoves(myPiece, s.pieces);
      // Limit visible "valid moves" to JUST the lesson destination so the
      // board doesn't light up with off-script options. Rotation-only
      // lessons (no moveTo) show no destinations at all.
      const limited = step.moveTo
        ? moves.filter(m => m.row === step.moveTo!.row && m.col === step.moveTo!.col)
        : [];
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

    if (!step.moveTo || row !== step.moveTo.row || col !== step.moveTo.col) {
      // Re-tapping the lesson piece is fine (it stays selected); shake
      // any other click.
      if (step.selectFrom && row === step.selectFrom.row && col === step.selectFrom.col) return;
      setShake(n => n + 1);
      return;
    }

    const next = applyMove(s, s.selectedPieceId, row, col);
    // Ant lessons that teach the "End Turn commits it" rule don't count
    // as done until the player actually presses End Turn — keep going.
    const done = step.endTurnCompletes ? false : !!step.isComplete?.(next);
    setPhase({ ...phase, state: next, done });
  }

  // Rotate the selected ant — mirrors useGame.rotateAntTo so the lesson
  // behaves exactly like the real game's HUD rotation buttons.
  function handleRotate(ori: Orientation) {
    if (phase.kind !== 'lesson' || phase.done) return;
    const step = TUTORIAL_STEPS[phase.index];
    const s = phase.state;
    if (!s.selectedPieceId) return;
    const p = s.pieces.find(x => x.id === s.selectedPieceId);
    if (!p || p.type !== 'ant' || !s.validRotations.includes(ori)) return;

    const newPieces = s.pieces.map(x => (x.id === p.id ? { ...x, orientation: ori } : x));
    const updated = { ...p, orientation: ori };
    const { moves, canRotate, validRotations } = getValidMoves(updated, newPieces);
    const limited = (!s.antMovedThisTurn && step.moveTo)
      ? moves.filter(m => m.row === step.moveTo!.row && m.col === step.moveTo!.col)
      : [];
    const ns: GameState = {
      ...s,
      pieces: newPieces,
      validMoves: s.antMovedThisTurn ? [] : limited,
      canRotate,
      validRotations,
      antHasRotated: true,
      antOriginalOrientation: s.antOriginalOrientation ?? p.orientation,
    };
    const done = step.endTurnCompletes ? false : !!step.isComplete?.(ns);
    setPhase({ ...phase, state: ns, done });
  }

  function handleEndTurn() {
    if (phase.kind !== 'lesson' || phase.done) return;
    const step = TUTORIAL_STEPS[phase.index];
    const s = phase.state;
    if (!s.selectedPieceId) return;
    const p = s.pieces.find(x => x.id === s.selectedPieceId);
    if (!p || p.type !== 'ant') return;
    if (!s.antMovedThisTurn && !s.antHasRotated) return;
    const next = applyEndTurn(s);
    const done = step.isComplete ? step.isComplete(next) : true;
    setPhase({ ...phase, state: next, done });
  }

  // ── Derived lesson view-model ─────────────────────────────────────
  const step = phase.kind === 'lesson' ? TUTORIAL_STEPS[phase.index] : null;
  const isCallout = step?.kind === 'callout';
  const selectedPiece = step && phase.kind === 'lesson' && phase.state.selectedPieceId
    ? phase.state.pieces.find(p => p.id === phase.state.selectedPieceId)
    : null;
  const antSelected = selectedPiece?.type === 'ant';
  const lessonState = phase.kind === 'lesson' ? phase.state : null;
  const canRotateNow = !!(
    phase.kind === 'lesson' && !phase.done && antSelected &&
    lessonState && lessonState.validRotations.length > 0
  );
  // End Turn is only offered once the lesson goal is already met, so a
  // premature press can never soft-lock the (turn-flipping) lesson.
  const preconditionMet = !!(
    step && lessonState && (step.isComplete ? step.isComplete(lessonState) : true)
  );
  const canEndTurn = !!(
    phase.kind === 'lesson' && !phase.done && antSelected && lessonState &&
    (lessonState.antMovedThisTurn || lessonState.antHasRotated) && preconditionMet
  );

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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={skipAll}
                className="text-xs opacity-60 hover:opacity-100 px-3 py-1.5 rounded-lg"
                style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, color: theme.textPrimary }}
              >
                {t('tutorial.skipAll')}
              </button>
              <SettingsButton variant="inline" />
            </div>
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
      {phase.kind === 'lesson' && step && (
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
                {t(step.titleKey)}
              </div>
              <div className="text-xs sm:text-sm opacity-85 mt-0.5 whitespace-pre-line">
                {phase.done && !isCallout
                  ? t(step.doneKey)
                  : t(step.bodyKey)}
              </div>
            </motion.div>

            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={skipAll}
                className="text-xs opacity-60 hover:opacity-100 px-3 py-1.5 rounded-lg whitespace-nowrap"
                style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, color: theme.textPrimary }}
              >
                {t('tutorial.skipAll')}
              </button>
              <SettingsButton variant="inline" />
            </div>
          </div>

          {step.tour ? (
            <TutorialTourScene baseState={phase.state} cellSize={cellSize} />
          ) : (
            <GameBoard
              state={phase.state}
              cellSize={cellSize}
              onCellClick={handleCellClick}
              tutorialHighlight={
                phase.done || phase.state.selectedPieceId
                  ? null
                  : step.selectFrom ?? null
              }
              extraHighlights={step.highlights}
            />
          )}

          {/* Ant lesson controls — the REAL rotation + End-Turn buttons,
              styled like the in-game HUD so the lesson matches the game. */}
          {(canRotateNow || canEndTurn) && (
            <div
              className="w-full max-w-md rounded-xl px-3 py-2 flex flex-col gap-2"
              style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
            >
              {canRotateNow && (
                <>
                  <div className="text-xs opacity-80">{t('hud.rotateTo')}</div>
                  <div className="flex flex-wrap gap-2">
                    {lessonState!.validRotations.map(ori => (
                      <button
                        key={ori}
                        type="button"
                        onClick={() => handleRotate(ori)}
                        className="font-semibold text-xs px-3 py-1.5 rounded-lg transition-transform hover:scale-105"
                        style={{
                          background: theme.buttonRotateBg,
                          border: `1px solid ${theme.buttonRotateBorder}`,
                          color: theme.buttonRotateText,
                        }}
                      >
                        {t(`orientation.${ori}`)}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {canEndTurn && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={handleEndTurn}
                  className="font-semibold text-sm px-4 py-2 rounded-lg self-start transition-transform hover:scale-105"
                  style={{
                    background: theme.buttonEndTurnBg,
                    border: `1px solid ${theme.buttonEndTurnBorder}`,
                    color: theme.buttonEndTurnText,
                  }}
                >
                  {t('hud.endTurn')}
                </motion.button>
              )}
            </div>
          )}

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
            {(phase.done || isCallout) && (
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
            <SettingsButton variant="inline" />
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
