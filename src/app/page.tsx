'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useGame } from '@/hooks/useGame';
import { useGameAudio } from '@/hooks/useGameAudio';
import { useSettings } from '@/hooks/useSettings';
import { AI_LEVEL_META } from '@/game/ai';
import StartScreen from '@/components/StartScreen';
import AuthBadge from '@/components/AuthBadge';
import NotificationBell from '@/components/NotificationBell';

// Heavy panel — only load it when the user actually opens it.
const SettingsPanel = dynamic(() => import('@/components/SettingsPanel'), { ssr: false });

// In-game components are lazy-loaded so the menu screen's initial JS payload
// doesn't drag along the board, HUD, framer-motion piece animations, etc.
// We preload them in the background once the menu mounts (see useEffect below)
// so by the time the player clicks Start, the chunks are already cached.
const GameBoard = dynamic(() => import('@/components/GameBoard'), { ssr: false });
const GameHUD = dynamic(() => import('@/components/GameHUD'), { ssr: false });
const WinScreen = dynamic(() => import('@/components/WinScreen'), { ssr: false });

export default function Home() {
  const {
    state,
    aiThinking,
    startGame,
    resetGame,
    restartMatch,
    rotateAntTo,
    endTurn,
    switchToShieldedPiece,
    switchToShieldingButterfly,
    clickCell,
    historyBack,
    historyForward,
    historyToLive,
    historyJumpTo,
    dismissWinScreen,
    showWinScreen,
  } = useGame();
  const { theme, isRTL, t } = useSettings();

  // Sound + haptics. Offline play has the human as player 1, so we
  // pass viewerPlayer=1; pass-and-play with two humans on the same
  // device technically has two viewers but they share a screen, so
  // any single choice for "who's the local user" is fine for cues.
  useGameAudio({ state, viewerPlayer: 1 });

  const search = useSearchParams();
  const [cellSize, setCellSize] = useState(42);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Tutorial CTA: when the tutorial's "Play vs Easy AI" button routes
  // back to /?ai=easy, auto-launch a fresh untimed easy-AI game so the
  // player drops straight onto the board instead of having to re-click
  // through the offline modal. We guard with a once-per-mount flag so a
  // subsequent restart-match doesn't get hijacked by the same param.
  const aiParam = search?.get('ai');
  useEffect(() => {
    if (aiParam !== 'easy') return;
    if (state.phase !== 'menu') return;
    startGame('butterfly', { kind: 'none' });
    // Strip the param so a refresh / Main-Menu doesn't relaunch.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('ai');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [aiParam, state.phase, startGame]);

  // While reviewing history, render the historical pieces but keep the live
  // selection state empty so highlights don't bleed into the review.
  const reviewing = state.viewingHistoryIndex !== null;
  // Memoized so we don't hand the board a fresh `displayState` reference on
  // unrelated re-renders (e.g. cellSize changes from a resize). The play page
  // already does this; the home page was missing it.
  const displayState = useMemo(() => {
    if (!reviewing) return state;
    const snap = state.history[state.viewingHistoryIndex!];
    return {
      ...state,
      pieces: snap.pieces,
      currentPlayer: snap.currentPlayer,
      lastAction: snap.lastAction,
      turn: snap.turn,
      selectedPieceId: null,
      validMoves: [],
      canRotate: false,
      validRotations: [],
      bounceEffect: undefined,
    };
  }, [state, reviewing]);

  // Preload the in-game chunks while the menu is visible so the click-to-play
  // transition feels instant. Fire-and-forget — webpack caches the modules.
  useEffect(() => {
    if (state.phase !== 'menu') return;
    void import('@/components/GameBoard');
    void import('@/components/GameHUD');
    void import('@/components/WinScreen');
  }, [state.phase]);

  useEffect(() => {
    function calc() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Side-by-side at lg (≥1024). Below that, the HUD stacks under the board.
      const sideBySide = vw >= 1024;

      const padX = vw < 380 ? 6 : vw < 640 ? 12 : sideBySide ? 12 : 20;
      // HUD width on lg+ matches the compact `.zi-hud` clamp in globals.css
      // (clamp(11rem, 14vw, 18rem)). Keeping these in sync means the board
      // can grow into every pixel of the freed-up width.
      const hudReserve = sideBySide
        ? Math.max(11 * 16, Math.min(20 * 16, Math.floor(vw * 0.15)))
        : 0;
      const flexGap = sideBySide ? 12 : 0;

      // Board = 16 cells + 0.5-cell row label = 16.5; pad slightly for safety.
      const widthBudget = vw - padX * 2 - hudReserve - flexGap;
      const maxFromW = Math.floor(widthBudget / 16.6);

      const padY = sideBySide ? 36 : 56;
      const maxFromH = Math.floor((vh - padY) / 16.6);

      const minCell = vw < 360 ? 14 : 16;
      const maxCell = sideBySide
        ? (vw >= 1600 ? 124 : vw >= 1280 ? 104 : 86)
        : 60;
      setCellSize(Math.max(minCell, Math.min(maxCell, maxFromW, maxFromH)));
    }

    // RAF-throttle: a drag-resize fires the resize event ~60×/s. Without
    // throttling, each fire triggers a setState → re-render of 256 cells.
    // requestAnimationFrame coalesces them so we recalc at most once per frame.
    let raf = 0;
    function schedule() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        calc();
      });
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

  if (state.phase === 'menu') {
    return (
      <>
        <StartScreen
          onStart={(aiLevel, tc) => startGame(aiLevel, tc)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      </>
    );
  }

  return (
    <main
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen w-full max-w-full flex flex-col lg:flex-row items-center lg:items-start justify-center lg:justify-center gap-3 lg:gap-4 px-2 sm:px-3 lg:px-4 py-3 sm:py-3 lg:py-3 pt-14 lg:pt-3 overflow-x-hidden overflow-y-auto box-border"
      style={{
        minHeight: '100dvh',
        background: theme.bgGradient,
        color: theme.textPrimary,
      }}
    >
      {/* Top bar: settings (corner) + auth badge (opposite corner). */}
      <button
        onClick={() => setSettingsOpen(true)}
        aria-label="Open settings"
        className="fixed top-3 z-30 rounded-full text-xl flex items-center justify-center transition-transform hover:scale-110"
        style={{
          [isRTL ? 'right' : 'left']: 12,
          width: 40, height: 40,
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
          color: theme.textPrimary,
        } as React.CSSProperties}
      >
        ⚙️
      </button>
      <div
        className="fixed top-3 z-30 flex items-center gap-2"
        style={{ [isRTL ? 'left' : 'right']: 12 } as React.CSSProperties}
      >
        <NotificationBell />
        <AuthBadge side={isRTL ? 'left' : 'right'} />
      </div>

      <div className="flex flex-col gap-3 sm:gap-4 items-center lg:shrink-0 relative">
        <GameBoard
          state={displayState}
          cellSize={cellSize}
          onCellClick={clickCell}
        />
        {reviewing && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 z-20 rounded-full px-4 py-1.5 text-sm font-semibold pointer-events-none"
            style={{
              background: theme.panelBg,
              border: `1px solid ${theme.p1AccentBorder}`,
              color: theme.p1Color,
              backdropFilter: 'blur(6px)',
            }}
          >
            ⏪ Reviewing turn {state.viewingHistoryIndex! + 1} / {state.history.length}
          </div>
        )}
        {/* AI "thinking" pill — appears only on the bot's turn so the user
            knows their taps will be ignored for the next ~half-second.
            Floats above the board, identical placement to the review pill,
            so it can never collide with the corner buttons. */}
        {aiThinking && !reviewing && state.aiLevel && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 z-20 rounded-full px-4 py-1.5 text-sm font-semibold pointer-events-none flex items-center gap-1.5"
            style={{
              background: theme.panelBg,
              border: `1px solid ${theme.p2AccentBorder}`,
              color: theme.p2Color,
              backdropFilter: 'blur(6px)',
            }}
          >
            <span className="zi-emoji-bob" aria-hidden>{AI_LEVEL_META[state.aiLevel].emoji}</span>
            <span>{t('ai.thinking')}</span>
          </div>
        )}
      </div>

      <GameHUD
        state={displayState}
        reviewing={reviewing}
        historyIndex={state.viewingHistoryIndex}
        historyLength={state.history.length}
        onMainMenu={resetGame}
        onRestartMatch={restartMatch}
        onRotateTo={rotateAntTo}
        onEndTurn={endTurn}
        onSwitchToShieldedPiece={switchToShieldedPiece}
        onSwitchToShieldingButterfly={switchToShieldingButterfly}
        onHistoryBack={historyBack}
        onHistoryForward={historyForward}
        onHistoryToLive={historyToLive}
        onHistoryJumpTo={historyJumpTo}
      />

      {state.phase === 'won' && state.winner && !state.winScreenDismissed && (
        <WinScreen
          winner={state.winner}
          onRestart={restartMatch}
          onMenu={resetGame}
          onDismiss={dismissWinScreen}
        />
      )}

      {state.phase === 'won' && state.winner && state.winScreenDismissed && (
        <button
          onClick={showWinScreen}
          className="fixed bottom-4 z-30 rounded-full px-4 py-2 font-bold text-sm shadow-lg transition-transform hover:scale-105"
          style={{
            [isRTL ? 'left' : 'right']: 16,
            background: theme.p1AccentBg,
            border: `1px solid ${theme.p1AccentBorder}`,
            color: theme.p1Color,
          } as React.CSSProperties}
        >
          🏆 Player {state.winner} won — view result
        </button>
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}
