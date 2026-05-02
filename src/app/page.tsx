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

// Heavy panel — only load it when the user actually opens it.
const SettingsPanel = dynamic(() => import('@/components/SettingsPanel'), { ssr: false });

export default function Home() {
  const { state, startGame, resetGame, rotateAntTo, endTurn, switchToShieldedPiece, switchToShieldingButterfly, clickCell } = useGame();
  const { theme, isRTL } = useSettings();
  const [cellSize, setCellSize] = useState(42);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    function calc() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Side-by-side at lg (≥1024). Below that, the HUD stacks under the board.
      const sideBySide = vw >= 1024;

      const padX = vw < 380 ? 6 : vw < 640 ? 12 : sideBySide ? 24 : 20;
      // HUD width = clamp(16rem, 24vw, 30rem) at lg+. Mirror that so the
      // board's max cell size never collides with the panel.
      const hudReserve = sideBySide
        ? Math.max(16 * 16, Math.min(30 * 16, Math.floor(vw * 0.24)))
        : 0;
      const flexGap = sideBySide ? 16 : 0;

      // Board = 16 cells + 0.5-cell row label = 16.5; use 16.6 for tiny safety margin.
      const widthBudget = vw - padX * 2 - hudReserve - flexGap;
      const maxFromW = Math.floor(widthBudget / 16.6);

      // Vertical budget: just the column-label row (≈0.6 cell) + tiny page padding.
      // On stacked layouts the HUD sits below and scrolls, so we still drive size by height.
      const padY = sideBySide ? 36 : 56;
      const maxFromH = Math.floor((vh - padY) / 16.6);

      const minCell = vw < 360 ? 14 : 16;
      // Allow large cells on roomy screens so the board fills the page.
      const maxCell = sideBySide
        ? (vw >= 1600 ? 96 : vw >= 1280 ? 84 : 68)
        : 60;
      const next = Math.max(minCell, Math.min(maxCell, maxFromW, maxFromH));
      setCellSize(next);
    }
    calc();
    window.addEventListener('resize', calc);
    window.addEventListener('orientationchange', calc);
    return () => {
      window.removeEventListener('resize', calc);
      window.removeEventListener('orientationchange', calc);
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
      className="min-h-screen w-full max-w-full flex flex-col lg:flex-row items-center lg:items-center justify-center lg:justify-center gap-3 lg:gap-4 px-2 sm:px-3 lg:px-4 py-3 sm:py-3 lg:py-3 pt-14 lg:pt-3 overflow-x-hidden overflow-y-auto box-border"
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
        className="fixed top-3 z-30"
        style={{ [isRTL ? 'left' : 'right']: 12 } as React.CSSProperties}
      >
        <AuthBadge side={isRTL ? 'left' : 'right'} />
      </div>

      <div className="flex flex-col gap-3 sm:gap-4 items-center lg:shrink-0">
        <GameBoard
          state={state}
          cellSize={cellSize}
          onCellClick={clickCell}
        />
      </div>

      <GameHUD
        state={state}
        onReset={resetGame}
        onRotateTo={rotateAntTo}
        onEndTurn={endTurn}
        onSwitchToShieldedPiece={switchToShieldedPiece}
        onSwitchToShieldingButterfly={switchToShieldingButterfly}
      />

      {state.phase === 'won' && state.winner && (
        <WinScreen winner={state.winner} onRestart={startGame} onMenu={resetGame} />
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}
