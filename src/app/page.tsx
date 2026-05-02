'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useGame } from '@/hooks/useGame';
import { useSettings } from '@/hooks/useSettings';
import GameBoard from '@/components/GameBoard';
import GameHUD from '@/components/GameHUD';
import WinScreen from '@/components/WinScreen';
import StartScreen from '@/components/StartScreen';
import AuthBadge from '@/components/AuthBadge';
import NotificationBell from '@/components/NotificationBell';

// Heavy panel — only load it when the user actually opens it.
const SettingsPanel = dynamic(() => import('@/components/SettingsPanel'), { ssr: false });

export default function Home() {
  const {
    state,
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
  const { theme, isRTL } = useSettings();
  const [cellSize, setCellSize] = useState(42);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // While reviewing history, render the historical pieces but keep the live
  // selection state empty so highlights don't bleed into the review.
  const reviewing = state.viewingHistoryIndex !== null;
  const displayState = reviewing
    ? {
        ...state,
        pieces: state.history[state.viewingHistoryIndex!].pieces,
        currentPlayer: state.history[state.viewingHistoryIndex!].currentPlayer,
        lastAction: state.history[state.viewingHistoryIndex!].lastAction,
        turn: state.history[state.viewingHistoryIndex!].turn,
        selectedPieceId: null,
        validMoves: [],
        canRotate: false,
        validRotations: [],
        bounceEffect: undefined,
      }
    : state;

  useEffect(() => {
    function calc() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Side-by-side at lg (≥1024). Below that, the HUD stacks under the board.
      const sideBySide = vw >= 1024;

      const padX = vw < 380 ? 6 : vw < 640 ? 12 : sideBySide ? 24 : 20;
      // HUD width = clamp(15rem, 20vw, 22rem) at lg+. Mirror that here so the
      // board's max cell size never collides with the panel.
      const hudReserve = sideBySide
        ? Math.max(16 * 16, Math.min(30 * 16, Math.floor(vw * 0.22)))
        : 0;
      const flexGap = sideBySide ? 16 : 0;

      // Board = 16 cells + 0.5-cell row label = 16.5; pad slightly for safety.
      const widthBudget = vw - padX * 2 - hudReserve - flexGap;
      const maxFromW = Math.floor(widthBudget / 16.6);

      const padY = sideBySide ? 36 : 56;
      const maxFromH = Math.floor((vh - padY) / 16.6);

      const minCell = vw < 360 ? 14 : 16;
      const maxCell = sideBySide
        ? (vw >= 1600 ? 96 : vw >= 1280 ? 84 : 68)
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
        <StartScreen onStart={startGame} onOpenSettings={() => setSettingsOpen(true)} />
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
