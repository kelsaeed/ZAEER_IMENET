'use client';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';
import { applyMove, applyEndTurn, getValidMoves } from '@/game/logic';
import type { GameState, Orientation } from '@/game/types';
import { TUTORIAL_STEPS, tutorialState } from '@/game/tutorial';
import SettingsButton from '@/components/SettingsButton';

// Heavy chunks — defer them so the first paint (the kill-cycle wheel)
// is light and the page opens smoothly. They're prefetched the moment
// the wheel mounts (see the effect below) so the first lesson is ready.
const GameBoard = dynamic(() => import('@/components/GameBoard'), { ssr: false, loading: () => <div /> });
const KillCycleWheel = dynamic(() => import('@/components/KillCycleWheel'), { ssr: false, loading: () => <div /> });
const TutorialTourScene = dynamic(() => import('@/components/TutorialTourScene'), { ssr: false, loading: () => <div /> });

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

/** Interactive tutorial. First the kill-cycle wheel, then a
 *  non-interactive UI tour, then guided board lessons. The board is
 *  sized exactly like the real game (big, viewport-driven) with the
 *  instruction + controls living in a side panel on desktop and
 *  stacked on mobile — same shape as a live match. */
export default function TutorialPage() {
  const router = useRouter();
  const { theme, isRTL, t } = useSettings();
  const [phase, setPhase] = useState<Phase>({ kind: 'wheel' });
  const [shake, setShake] = useState(0);
  const [cellSize, setCellSize] = useState(40);

  // Mark tutorial-seen so the home-page first-load toast doesn't keep
  // pestering returning users. Also warm the heavy chunks now so moving
  // off the wheel into the first lesson is instant.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('zaeer.tutorialSeen', '1'); } catch { /* ignore */ }
    }
    void import('@/components/GameBoard');
    void import('@/components/GameHUD');
    void import('@/components/TutorialTourScene');
  }, []);

  // Responsive cell sizing — mirrors the real match page so the tutorial
  // board is the SAME size as a live game. On lg+ the board sits beside
  // a side panel (reserve its width); on mobile it's full-width with
  // room kept for the stacked instruction + controls. useLayoutEffect so
  // the first paint is already at the right size (no CLS jump).
  useLayoutEffect(() => {
    function calc() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const sideBySide = vw >= 1024;
      const padX = vw < 380 ? 6 : vw < 640 ? 12 : 16;
      // Side panel (instruction card + controls + Next) reserve on lg.
      const sideReserve = sideBySide
        ? Math.max(208, Math.min(360, Math.floor(vw * 0.18)))
        : 0;
      const flexGap = sideBySide ? 20 : 0;
      const widthBudget = vw - padX * 2 - sideReserve - flexGap;
      const maxFromW = Math.floor(widthBudget / 16.6);
      // Vertical reserve: lg keeps the corners fixed so only the top bar
      // needs clearing; mobile must leave room for the stacked panel.
      const padY = sideBySide ? 84 : 260;
      const maxFromH = Math.floor((vh - padY) / 16.6);
      const minCell = vw < 360 ? 14 : 16;
      const maxCell = sideBySide
        ? (vw >= 1600 ? 96 : vw >= 1280 ? 84 : 64)
        : 52;
      setCellSize(Math.max(minCell, Math.min(maxCell, maxFromW, maxFromH)));
    }
    let raf = 0;
    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; calc(); });
    }
    calc();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
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

  // Reset the current step to its starting position — wipes any move /
  // rotation the player made (and any wrong-move shake) so they can take
  // the lesson again from scratch without leaving the tutorial.
  function resetStep() {
    if (phase.kind !== 'lesson') return;
    const i = phase.index;
    setShake(0);
    setPhase({
      kind: 'lesson',
      index: i,
      state: tutorialState(TUTORIAL_STEPS[i].pieces),
      done: initialDone(i),
    });
  }

  // ── Locked click handler ─────────────────────────────────────────
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
      if (step.selectFrom && row === step.selectFrom.row && col === step.selectFrom.col) return;
      setShake(n => n + 1);
      return;
    }

    const next = applyMove(s, s.selectedPieceId, row, col);
    const done = step.endTurnCompletes ? false : !!step.isComplete?.(next);
    setPhase({ ...phase, state: next, done });
  }

  // Rotate the selected ant — mirrors useGame.rotateAntTo.
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
  const lessonState = phase.kind === 'lesson' ? phase.state : null;
  const selectedPiece = lessonState?.selectedPieceId
    ? lessonState.pieces.find(p => p.id === lessonState.selectedPieceId)
    : null;
  const antSelected = selectedPiece?.type === 'ant';
  const canRotateNow = !!(
    phase.kind === 'lesson' && !phase.done && antSelected &&
    lessonState && lessonState.validRotations.length > 0
  );
  const preconditionMet = !!(
    step && lessonState && (step.isComplete ? step.isComplete(lessonState) : true)
  );
  const canEndTurn = !!(
    phase.kind === 'lesson' && !phase.done && antSelected && lessonState &&
    (lessonState.antMovedThisTurn || lessonState.antHasRotated) && preconditionMet
  );

  // Shared fixed top-corner controls (match the live game's layout so the
  // board can use the full height). Main Menu on the inline-start corner,
  // Skip + Settings on the inline-end corner.
  const corners = (
    <>
      <Link
        href="/"
        aria-label={t('win.mainMenu')}
        className="fixed top-3 z-30 text-sm font-semibold px-3 py-2 rounded-full transition-transform hover:scale-105"
        style={{
          [isRTL ? 'right' : 'left']: 12,
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
          color: theme.textPrimary,
        } as React.CSSProperties}
      >
        {isRTL ? '→' : '←'} {t('win.mainMenu')}
      </Link>
      <div
        className="fixed top-3 z-30 flex items-center gap-2"
        style={{ [isRTL ? 'left' : 'right']: 12 } as React.CSSProperties}
      >
        {phase.kind !== 'end' && (
          <button
            type="button"
            onClick={skipAll}
            className="text-xs opacity-70 hover:opacity-100 px-3 py-2 rounded-full"
            style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, color: theme.textPrimary }}
          >
            {t('tutorial.skipAll')}
          </button>
        )}
        <SettingsButton variant="inline" />
      </div>
    </>
  );

  // ── Render ───────────────────────────────────────────────────────
  return (
    <main
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen w-full max-w-full flex flex-col items-center px-2 sm:px-3 py-2 pt-16 lg:pt-14 overflow-x-hidden overflow-y-auto box-border"
      style={{ background: theme.bgGradient, color: theme.textPrimary, minHeight: '100dvh' }}
    >
      {corners}

      {/* WHEEL phase */}
      {phase.kind === 'wheel' && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-2xl flex flex-col items-center gap-4 mt-4"
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
      )}

      {/* LESSON phase */}
      {phase.kind === 'lesson' && step && (
        step.tour ? (
          // UI tour: a slim instruction banner above the faux full-game
          // scene (board + real HUD), which fills the width itself.
          <div className="w-full flex flex-col items-center gap-3">
            <motion.div
              key={`tour-${phase.index}-${shake}`}
              className="w-full max-w-4xl rounded-2xl px-4 py-3 text-center"
              style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
            >
              <div className="text-base sm:text-lg font-extrabold" style={{ color: theme.p1Color }}>
                {t(step.titleKey)}
              </div>
              <div className="text-xs sm:text-sm opacity-85 mt-1 whitespace-pre-line text-start">
                {t(step.bodyKey)}
              </div>
            </motion.div>
            <TutorialTourScene baseState={phase.state} cellSize={cellSize} />
            <NavRow
              index={phase.index}
              total={TUTORIAL_STEPS.length}
              showNext
              onSkip={advance}
              onNext={advance}
              onRetry={resetStep}
              theme={theme}
              t={t}
            />
          </div>
        ) : (
          // Move/ant lesson: BIG board beside a side panel, exactly like a
          // live match. Stacks on mobile (instruction first, then board).
          <div className="w-full flex flex-col lg:flex-row items-center lg:items-start justify-center gap-3 lg:gap-5">
            <div className="flex flex-col items-center order-2 lg:order-1 lg:shrink-0">
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
            </div>

            <div className="w-full max-w-md lg:w-[clamp(13rem,18vw,22.5rem)] order-1 lg:order-2 flex flex-col gap-3">
              <motion.div
                key={`step-${phase.index}-${shake}`}
                initial={{ x: 0 }}
                animate={shake > 0 ? { x: [-6, 6, -4, 4, 0] } : { x: 0 }}
                transition={{ duration: 0.32 }}
                className="rounded-2xl px-4 py-3"
                style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
              >
                <div className="text-base sm:text-lg font-extrabold" style={{ color: theme.p1Color }}>
                  {t(step.titleKey)}
                </div>
                <div className="text-sm opacity-85 mt-1 whitespace-pre-line">
                  {phase.done && !isCallout ? t(step.doneKey) : t(step.bodyKey)}
                </div>
              </motion.div>

              {(canRotateNow || canEndTurn) && (
                <div
                  className="rounded-2xl px-4 py-3 flex flex-col gap-2"
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
                            className="font-semibold text-xs px-3 py-2 rounded-lg transition-transform hover:scale-105"
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

              <NavRow
                index={phase.index}
                total={TUTORIAL_STEPS.length}
                showNext={phase.done || !!isCallout}
                onSkip={advance}
                onNext={advance}
                onRetry={resetStep}
                theme={theme}
                t={t}
              />
            </div>
          </div>
        )
      )}

      {/* END phase */}
      {phase.kind === 'end' && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md flex flex-col items-center gap-4 mt-10"
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
      )}
    </main>
  );
}

/** Step counter + Skip + (when ready) Next. Shared by the tour banner
 *  and the lesson side panel so the controls stay identical. */
function NavRow({
  index, total, showNext, onSkip, onNext, onRetry, theme, t,
}: {
  index: number;
  total: number;
  showNext: boolean;
  onSkip: () => void;
  onNext: () => void;
  onRetry: () => void;
  theme: ReturnType<typeof useSettings>['theme'];
  t: ReturnType<typeof useSettings>['t'];
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs opacity-60">
        {t('tutorial.stepCounter')
          .replace('{n}', String(index + 1))
          .replace('{total}', String(total))}
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs opacity-65 hover:opacity-100 px-3 py-2 rounded-lg"
        style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, color: theme.textPrimary }}
      >
        {t('tutorial.retry')}
      </button>
      <button
        type="button"
        onClick={onSkip}
        className="text-xs opacity-65 hover:opacity-100 px-3 py-2 rounded-lg"
        style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, color: theme.textPrimary }}
      >
        {t('tutorial.skip')}
      </button>
      {showNext && (
        <motion.button
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={onNext}
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
  );
}
