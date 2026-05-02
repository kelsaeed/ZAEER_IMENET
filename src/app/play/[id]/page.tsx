'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { useOnlineGame } from '@/hooks/useOnlineGame';
import GameBoard from '@/components/GameBoard';
import GameHUD from '@/components/GameHUD';
import WinScreen from '@/components/WinScreen';
import AuthBadge from '@/components/AuthBadge';
import LoadingEmojis from '@/components/LoadingEmojis';

const SettingsPanel = dynamic(() => import('@/components/SettingsPanel'), { ssr: false });

export default function OnlineGamePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const gameId = params?.id ?? null;
  const { user, profile, loading: userLoading } = useUser();
  const { theme, isRTL, t } = useSettings();
  const [cellSize, setCellSize] = useState(42);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [winDismissed, setWinDismissed] = useState(false);

  const {
    loading,
    error,
    game,
    state,
    myPlayerNumber,
    opponent,
    isPlaying,
    isMyTurn,
    viewingHistoryIndex,
    clickCell,
    rotateAntTo,
    endTurn,
    switchToShieldedPiece,
    switchToShieldingButterfly,
    resign,
    historyBack,
    historyForward,
    historyToLive,
    historyJumpTo,
  } = useOnlineGame(gameId);

  // Auth gate.
  useEffect(() => {
    if (!userLoading && !user) router.replace(`/login?next=/play/${gameId}`);
  }, [userLoading, user, router, gameId]);

  // Responsive cell sizing — same RAF-throttled logic as the local page.
  useEffect(() => {
    function calc() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const sideBySide = vw >= 1024;
      const padX = vw < 380 ? 6 : vw < 640 ? 12 : sideBySide ? 24 : 20;
      const hudReserve = sideBySide
        ? Math.max(15 * 16, Math.min(22 * 16, Math.floor(vw * 0.20)))
        : 0;
      const flexGap = sideBySide ? 16 : 0;
      const widthBudget = vw - padX * 2 - hudReserve - flexGap;
      const maxFromW = Math.floor(widthBudget / 16.6);
      const padY = sideBySide ? 96 : 110; // bigger top padding to fit the player bar
      const maxFromH = Math.floor((vh - padY) / 16.6);
      const minCell = vw < 360 ? 14 : 16;
      const maxCell = sideBySide
        ? (vw >= 1600 ? 96 : vw >= 1280 ? 84 : 68)
        : 60;
      setCellSize(Math.max(minCell, Math.min(maxCell, maxFromW, maxFromH)));
    }

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

  const reviewing = viewingHistoryIndex !== null;
  const displayState = useMemo(() => {
    if (!state) return null;
    if (!reviewing) return state;
    const snap = state.history[viewingHistoryIndex!];
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
  }, [state, reviewing, viewingHistoryIndex]);

  // Loading / error / not-a-player gates.
  if (userLoading || loading) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ background: theme.bgGradient, color: theme.textPrimary }}
      >
        <LoadingEmojis size={28} />
      </main>
    );
  }
  if (!user) return null; // useEffect already redirected
  if (error || !game || !state) {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: theme.bgGradient, color: theme.textPrimary }}
      >
        <div className="max-w-sm text-center">
          <div className="text-4xl mb-3">😕</div>
          <div className="font-bold mb-1">Game not found</div>
          <div className="text-sm opacity-70 mb-4">{error ?? 'It may have ended or been deleted.'}</div>
          <Link
            href="/play"
            className="rounded-lg px-4 py-2 inline-block font-semibold"
            style={{
              background: theme.buttonRotateBg,
              border: `1px solid ${theme.buttonRotateBorder}`,
              color: theme.buttonRotateText,
            }}
          >
            ← Back to lobby
          </Link>
        </div>
      </main>
    );
  }

  // Waiting room — player1 created and is waiting for player2.
  if (game.status === 'waiting') {
    const isHost = game.player1_id === user.id;
    return (
      <main
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: theme.bgGradient, color: theme.textPrimary }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full rounded-2xl p-6 text-center"
          style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
        >
          <div className="text-3xl mb-2">⏳</div>
          <h1 className="text-xl font-extrabold mb-1" style={{ color: theme.p1Color }}>
            Waiting for opponent…
          </h1>
          <div className="mt-3 mb-5">
            <LoadingEmojis size={28} />
          </div>
          {isHost && game.invite_code && (
            <>
              <div className="text-sm opacity-80 mb-2">Share this code with a friend:</div>
              <div
                className="font-mono font-extrabold text-3xl tracking-widest mb-4"
                style={{ color: theme.p1Color, letterSpacing: '0.4em' }}
              >
                {game.invite_code}
              </div>
              <button
                onClick={() => navigator.clipboard?.writeText(game.invite_code!)}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold mb-4"
                style={{
                  background: theme.buttonBg,
                  border: `1px solid ${theme.buttonBorder}`,
                  color: theme.textPrimary,
                }}
              >
                Copy code
              </button>
            </>
          )}
          <div className="flex gap-2 justify-center mt-2">
            <Link
              href="/play"
              className="rounded-lg px-3 py-1.5 text-sm font-semibold"
              style={{
                background: theme.buttonBg,
                border: `1px solid ${theme.buttonBorder}`,
                color: theme.textPrimary,
              }}
            >
              ← Lobby
            </Link>
          </div>
        </motion.div>
      </main>
    );
  }

  // Spectator: not part of the game. Read-only view.
  const isSpectator = myPlayerNumber === null;

  const won = game.status === 'finished' || game.status === 'abandoned';
  const winner = game.winner_id === game.player1_id ? 1 : game.winner_id === game.player2_id ? 2 : null;

  return (
    <main
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen w-full max-w-full flex flex-col lg:flex-row items-center lg:items-start justify-center lg:justify-center gap-3 lg:gap-4 px-2 sm:px-3 lg:px-4 py-3 sm:py-3 lg:py-3 pt-20 lg:pt-3 overflow-x-hidden overflow-y-auto box-border"
      style={{
        minHeight: '100dvh',
        background: theme.bgGradient,
        color: theme.textPrimary,
      }}
    >
      {/* Top bar: settings / auth + player ribbon */}
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

      {/* Player ribbon — shows both players + whose turn it is */}
      <div
        className="fixed left-1/2 -translate-x-1/2 top-3 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
        style={{
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
          color: theme.textPrimary,
        }}
      >
        <PlayerChip
          name={myPlayerNumber === 1 ? (profile?.display_name ?? 'You') : (game.player1_id ? (opponent?.display_name ?? 'P1') : '…')}
          color={theme.p1Color}
          isYou={myPlayerNumber === 1}
          isTurn={state.currentPlayer === 1 && isPlaying}
        />
        <span className="opacity-50 text-xs">vs</span>
        <PlayerChip
          name={myPlayerNumber === 2 ? (profile?.display_name ?? 'You') : (game.player2_id ? (opponent?.display_name ?? 'P2') : '…')}
          color={theme.p2Color}
          isYou={myPlayerNumber === 2}
          isTurn={state.currentPlayer === 2 && isPlaying}
        />
      </div>

      <div className="flex flex-col gap-3 sm:gap-4 items-center lg:shrink-0 relative">
        <GameBoard
          state={displayState!}
          cellSize={cellSize}
          onCellClick={isSpectator ? () => {} : clickCell}
        />
        {!isMyTurn && !reviewing && !won && !isSpectator && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 z-20 rounded-full px-4 py-1.5 text-sm font-semibold pointer-events-none"
            style={{
              background: theme.panelBg,
              border: `1px solid ${theme.panelBorder}`,
              color: theme.textMuted,
              backdropFilter: 'blur(6px)',
            }}
          >
            ⏳ Waiting for {opponent?.display_name ?? 'opponent'}…
          </div>
        )}
        {isSpectator && !won && (
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 z-20 rounded-full px-4 py-1.5 text-sm font-semibold pointer-events-none"
            style={{
              background: theme.panelBg,
              border: `1px solid ${theme.p1AccentBorder}`,
              color: theme.p1Color,
              backdropFilter: 'blur(6px)',
            }}
          >
            👀 Spectating
          </div>
        )}
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
            ⏪ Reviewing turn {viewingHistoryIndex! + 1} / {state.history.length}
          </div>
        )}
      </div>

      <GameHUD
        state={displayState!}
        reviewing={reviewing}
        historyIndex={viewingHistoryIndex}
        historyLength={state.history.length}
        onMainMenu={() => router.push('/play')}
        onRestartMatch={resign}
        onRotateTo={rotateAntTo}
        onEndTurn={endTurn}
        onSwitchToShieldedPiece={switchToShieldedPiece}
        onSwitchToShieldingButterfly={switchToShieldingButterfly}
        onHistoryBack={historyBack}
        onHistoryForward={historyForward}
        onHistoryToLive={historyToLive}
        onHistoryJumpTo={historyJumpTo}
      />

      {/* Resign button — bottom of HUD on mobile, floating on desktop */}
      {!isSpectator && !won && (
        <button
          onClick={resign}
          className="fixed bottom-4 z-20 rounded-full px-4 py-2 text-xs font-semibold opacity-70 hover:opacity-100 transition-opacity"
          style={{
            [isRTL ? 'right' : 'left']: 12,
            background: theme.buttonEndTurnBg,
            border: `1px solid ${theme.buttonEndTurnBorder}`,
            color: theme.buttonEndTurnText,
          } as React.CSSProperties}
        >
          🏳️ Resign
        </button>
      )}

      {/* Win modal */}
      {won && winner !== null && !winDismissed && (
        <WinScreen
          winner={winner}
          onRestart={() => router.push('/play')}
          onMenu={() => router.push('/')}
          onDismiss={() => setWinDismissed(true)}
        />
      )}
      {won && winner !== null && winDismissed && (
        <button
          onClick={() => setWinDismissed(false)}
          className="fixed bottom-4 z-30 rounded-full px-4 py-2 font-bold text-sm shadow-lg"
          style={{
            [isRTL ? 'left' : 'right']: 16,
            background: theme.p1AccentBg,
            border: `1px solid ${theme.p1AccentBorder}`,
            color: theme.p1Color,
          } as React.CSSProperties}
        >
          🏆 Result
        </button>
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}

function PlayerChip({
  name,
  color,
  isYou,
  isTurn,
}: {
  name: string;
  color: string;
  isYou: boolean;
  isTurn: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-xs"
      style={{
        background: isTurn ? `color-mix(in srgb, ${color} 25%, transparent)` : 'transparent',
        border: `1px solid ${isTurn ? color : 'transparent'}`,
        color,
      }}
    >
      <span
        className="w-2 h-2 rounded-full"
        style={{ background: color, boxShadow: isTurn ? `0 0 6px ${color}` : 'none' }}
      />
      {isYou ? `${name} (you)` : name}
    </span>
  );
}
