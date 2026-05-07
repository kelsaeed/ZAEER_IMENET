'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { useOnlineGame } from '@/hooks/useOnlineGame';
import { useGameAudio } from '@/hooks/useGameAudio';
import GameBoard from '@/components/GameBoard';
import GameHUD from '@/components/GameHUD';
import AuthBadge from '@/components/AuthBadge';
import NotificationBell from '@/components/NotificationBell';
import LoadingEmojis from '@/components/LoadingEmojis';
import Avatar from '@/components/Avatar';
import MatchChat from '@/components/MatchChat';
import { markGameNotificationsRead } from '@/lib/supabase/notifications';
import type { Player } from '@/game/types';
import type { Theme } from '@/game/themes';

const SettingsPanel = dynamic(() => import('@/components/SettingsPanel'), { ssr: false });
const OpponentMenu = dynamic(() => import('@/components/OpponentMenu'), { ssr: false });

export default function OnlineGamePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const gameId = params?.id ?? null;
  const { user, profile, loading: userLoading } = useUser();
  const { theme, isRTL, t } = useSettings();
  const [cellSize, setCellSize] = useState(42);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [winDismissed, setWinDismissed] = useState(false);
  // Visual feedback for the waiting-room invite-code copy button.
  const [inviteCopied, setInviteCopied] = useState(false);
  // Opponent menu (compact popover by default, expandable to a full-screen
  // profile modal). Closed when no anchor is set; tap on the opponent's chip
  // in the player ribbon to open it.
  const [opponentMenu, setOpponentMenu] = useState<
    null | { x: number; y: number; mode: 'compact' | 'full' }
  >(null);

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
    toggleReady,
    iAmReady,
    opponentReady,
    historyBack,
    historyForward,
    historyToLive,
    historyJumpTo,
  } = useOnlineGame(gameId);

  // Sound + haptics. viewerPlayer is whichever side the local user
  // actually plays as so the win/lose cue lands on the right side of
  // the table.
  useGameAudio({ state, viewerPlayer: myPlayerNumber });

  // Auth gate.
  useEffect(() => {
    if (!userLoading && !user) router.replace(`/login?next=/play/${gameId}`);
  }, [userLoading, user, router, gameId]);

  // Silence the bell — sitting in the match clears any "your turn" pings
  // for this game so the badge drops the moment the player walks in. The
  // server trigger fires a fresh ping on every async move, so we re-mark
  // read on every game-row change too: if the opponent moves while you're
  // already in the match, the just-emitted ping is silenced before you
  // can even see it.
  useEffect(() => {
    if (!user || !gameId) return;
    markGameNotificationsRead({ userId: user.id, gameId }).catch(() => {});
  }, [user, gameId, game?.updated_at]);

  // When the match number changes (rematch started), bring back the win
  // modal pill so the next match's result will surface again.
  useEffect(() => {
    setWinDismissed(false);
  }, [game?.match_number]);

  // Responsive cell sizing — same RAF-throttled logic as the local page.
  useEffect(() => {
    function calc() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const sideBySide = vw >= 1024;
      const padX = vw < 380 ? 6 : vw < 640 ? 12 : sideBySide ? 12 : 20;
      // Slimmer HUD reserve on desktop — HUD itself is now compact on lg+
      // (smaller fonts, condensed panels). The board can grow into the
      // freed-up width.
      const hudReserve = sideBySide
        ? Math.max(11 * 16, Math.min(20 * 16, Math.floor(vw * 0.15)))
        : 0;
      const flexGap = sideBySide ? 12 : 0;
      const widthBudget = vw - padX * 2 - hudReserve - flexGap;
      const maxFromW = Math.floor(widthBudget / 16.6);
      // Vertical reserve: on lg+ the player ribbon is fixed in the top bar
      // (no longer pushes the board down), so we only reserve top-padding
      // for the bar + a little breathing room. Mobile keeps more clearance
      // because the resign/chat float buttons sit near the bottom edge.
      const padY = sideBySide ? 56 : 140;
      const maxFromH = Math.floor((vh - padY) / 16.6);
      const minCell = vw < 360 ? 14 : 16;
      const maxCell = sideBySide
        ? (vw >= 1600 ? 124 : vw >= 1280 ? 104 : 86)
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

  // Only show "Game not found" if the initial fetch errored AND we never
  // got a game row. Once `game` is loaded, treat any later render glitch
  // as transient and show the loading screen instead — this keeps the
  // page from flashing the error after a resign / rematch / move when
  // the Realtime echo briefly returns a partial row.
  if (error && !game) {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: theme.bgGradient, color: theme.textPrimary }}
      >
        <div className="max-w-sm text-center">
          <div className="text-4xl mb-3">😕</div>
          <div className="font-bold mb-1">Game not found</div>
          <div className="text-sm opacity-70 mb-4">{error}</div>
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
  if (!game || !state) {
    // Game record exists but the state JSON is momentarily missing
    // (e.g. between a Realtime UPDATE event and our re-fetch). Show
    // the loading screen — never the "not found" error.
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ background: theme.bgGradient, color: theme.textPrimary }}
      >
        <LoadingEmojis size={26} />
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
              <motion.button
                onClick={() => {
                  navigator.clipboard?.writeText(game.invite_code!);
                  setInviteCopied(true);
                  setTimeout(() => setInviteCopied(false), 1800);
                }}
                whileTap={{ scale: 0.94 }}
                animate={inviteCopied ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                transition={{ duration: 0.4 }}
                className="rounded-lg px-4 py-2 text-sm font-bold mb-4 inline-flex items-center gap-1.5"
                style={{
                  background: inviteCopied ? theme.p1Color : theme.buttonRotateBg,
                  border: `1px solid ${inviteCopied ? theme.p1Color : theme.buttonRotateBorder}`,
                  color: inviteCopied ? '#000' : theme.buttonRotateText,
                  transition: 'background 200ms, color 200ms, border-color 200ms',
                }}
              >
                {inviteCopied ? <>✓ Copied!</> : <>📋 Copy code</>}
              </motion.button>
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

  // Player ribbon — rendered both inline (mobile) and inside the top bar
  // (desktop). Computing the markup once keeps the two render sites in
  // sync without forcing a re-layout when the viewport crosses lg.
  const ribbon = (() => {
    const statusInfo: { icon: string; text: string; tone: 'muted' | 'accent' } | null =
      reviewing
        ? { icon: '⏪', text: `Reviewing ${viewingHistoryIndex! + 1}/${state.history.length}`, tone: 'accent' }
        : isSpectator && !won
        ? { icon: '👀', text: 'Spectating', tone: 'accent' }
        : !isMyTurn && !won && !isSpectator
        ? { icon: '⏳', text: `Waiting for ${opponent?.display_name ?? 'opponent'}…`, tone: 'muted' }
        : null;
    return (
      <div
        className="flex items-center gap-1 sm:gap-2 px-2 py-1 rounded-full text-xs sm:text-sm shadow-sm"
        style={{
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
          color: theme.textPrimary,
          maxWidth: 'calc(100vw - 24px)',
        }}
      >
        <PlayerChip
          name={myPlayerNumber === 1 ? (profile?.display_name ?? 'You') : (game.player1_id ? (opponent?.display_name ?? 'P1') : '…')}
          avatarUrl={myPlayerNumber === 1 ? (profile?.avatar_url ?? null) : (opponent?.avatar_url ?? null)}
          color={theme.p1Color}
          isYou={myPlayerNumber === 1}
          isTurn={state.currentPlayer === 1 && isPlaying}
          accent="p1"
          // Player 1's chip is clickable when it's the OPPONENT (i.e. I'm
          // sitting as player 2 in this match). Spectators don't have an
          // opponent context, so we don't surface the menu for them.
          onOpenMenu={
            myPlayerNumber === 2 && opponent?.id
              ? (e) => setOpponentMenu({ x: e.clientX, y: e.clientY, mode: 'compact' })
              : undefined
          }
        />
        <span className="opacity-40 text-[10px] sm:text-xs px-0.5">vs</span>
        <PlayerChip
          name={myPlayerNumber === 2 ? (profile?.display_name ?? 'You') : (game.player2_id ? (opponent?.display_name ?? 'P2') : '…')}
          avatarUrl={myPlayerNumber === 2 ? (profile?.avatar_url ?? null) : (opponent?.avatar_url ?? null)}
          color={theme.p2Color}
          isYou={myPlayerNumber === 2}
          isTurn={state.currentPlayer === 2 && isPlaying}
          accent="p2"
          onOpenMenu={
            myPlayerNumber === 1 && opponent?.id
              ? (e) => setOpponentMenu({ x: e.clientX, y: e.clientY, mode: 'compact' })
              : undefined
          }
        />
        {statusInfo && (
          <span
            className="inline-flex items-center gap-1 ms-1 ps-2 pe-1 py-0.5 text-[10px] sm:text-xs font-semibold border-s"
            style={{
              borderColor: 'rgba(255,255,255,0.12)',
              color: statusInfo.tone === 'accent' ? theme.p1Color : theme.textMuted,
              maxWidth: 220,
            }}
          >
            <span aria-hidden>{statusInfo.icon}</span>
            <span className="truncate">{statusInfo.text}</span>
          </span>
        )}
      </div>
    );
  })();

  return (
    <main
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen w-full max-w-full flex flex-col lg:flex-row items-center lg:items-start justify-center lg:justify-center gap-2 lg:gap-3 px-2 sm:px-3 lg:px-2 py-2 sm:py-3 lg:py-1 pt-16 lg:pt-12 overflow-x-hidden overflow-y-auto box-border"
      style={{
        minHeight: '100dvh',
        background: theme.bgGradient,
        color: theme.textPrimary,
      }}
    >
      {/* Top corner buttons (settings on one side, bell + auth on the
          other). On lg+ the player ribbon sits centred between them on
          the same fixed top row — so the board can sit higher and there's
          no second header line eating vertical space. */}
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
      <div className="hidden lg:flex fixed top-3 left-1/2 -translate-x-1/2 z-30">
        {ribbon}
      </div>
      <div
        className="fixed top-3 z-30 flex items-center gap-2"
        style={{ [isRTL ? 'left' : 'right']: 12 } as React.CSSProperties}
      >
        <NotificationBell />
        <AuthBadge side={isRTL ? 'left' : 'right'} />
      </div>

      <div className="flex flex-col gap-2 sm:gap-3 items-center lg:shrink-0 lg:gap-0 relative">
        {/* Mobile-only ribbon: in-flow above the board. On lg+ the same
            ribbon lives in the top bar (rendered above) so the board can
            occupy the full vertical space. */}
        <div className="lg:hidden">{ribbon}</div>
        <GameBoard
          state={displayState!}
          cellSize={cellSize}
          onCellClick={isSpectator ? () => {} : clickCell}
        />
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

      {/* Series score chip */}
      {(game.series_p1_wins + game.series_p2_wins > 0) && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 rounded-full px-4 py-1.5 text-sm font-bold flex items-center gap-2"
          style={{
            background: theme.panelBg,
            border: `1px solid ${theme.panelBorder}`,
            color: theme.textPrimary,
          }}
        >
          <span style={{ color: theme.p1Color }}>{game.series_p1_wins}</span>
          <span className="opacity-50 text-xs">— series —</span>
          <span style={{ color: theme.p2Color }}>{game.series_p2_wins}</span>
        </div>
      )}

      {/* Win modal with rematch (winner sees Victory, loser sees Defeat) */}
      {won && winner !== null && !winDismissed && (
        <RematchModal
          winner={winner}
          myPlayerNumber={myPlayerNumber}
          isMyMatch={!isSpectator}
          iAmReady={iAmReady}
          opponentReady={opponentReady}
          onReady={toggleReady}
          onLeave={() => router.push('/play')}
          onDismiss={() => setWinDismissed(true)}
          theme={theme}
          opponentName={opponent?.display_name ?? 'Opponent'}
        />
      )}
      {won && winner !== null && winDismissed && (
        <button
          onClick={() => setWinDismissed(false)}
          className="fixed bottom-24 z-30 rounded-full px-4 py-2 font-bold text-sm shadow-lg"
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

      {/* Opponent menu — small popover on opponent-chip tap, expandable to
          a full-screen profile modal with head-to-head record. */}
      <OpponentMenu
        open={!!opponentMenu && !!opponent?.id}
        initialMode={opponentMenu?.mode ?? 'compact'}
        anchor={opponentMenu ? { x: opponentMenu.x, y: opponentMenu.y } : undefined}
        onClose={() => setOpponentMenu(null)}
        opponentId={opponent?.id ?? null}
        opponentUsername={opponent?.username ?? null}
        opponentName={opponent?.display_name ?? 'Opponent'}
        opponentAvatarUrl={opponent?.avatar_url ?? null}
        gameId={gameId}
      />

      {/* In-match chat (floating button + slide-in drawer) */}
      {gameId && <MatchChat gameId={gameId} spectator={isSpectator} />}
    </main>
  );
}

function PlayerChip({
  name,
  avatarUrl,
  color,
  isYou,
  isTurn,
  accent,
  onOpenMenu,
}: {
  name: string;
  avatarUrl: string | null;
  color: string;
  isYou: boolean;
  isTurn: boolean;
  accent: 'p1' | 'p2';
  /** Provided only for the opponent's chip — clicking opens the in-match
   *  add-friend / block / mute / view-profile menu anchored at the click. */
  onOpenMenu?: (e: React.MouseEvent) => void;
}) {
  // Show only the first word of the name in the chip — full name shown
  // on hover. Keeps the ribbon narrow enough to fit two chips + "vs"
  // without overflowing on phone-sized screens.
  const shortName = (name?.split(/\s+/)[0] ?? name ?? '?').slice(0, 12);
  const clickable = !!onOpenMenu;
  const Outer = clickable ? motion.button : motion.span;
  return (
    <Outer
      animate={isTurn ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={isTurn ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : {}}
      onClick={onOpenMenu}
      className={
        'inline-flex items-center gap-1.5 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full font-semibold text-xs min-w-0'
        + (clickable ? ' cursor-pointer hover:brightness-110 focus:outline-none focus:ring-1' : '')
      }
      style={{
        background: isTurn ? `color-mix(in srgb, ${color} 25%, transparent)` : 'transparent',
        border: `1px solid ${isTurn ? color : 'transparent'}`,
        color,
      }}
      title={isYou ? `${name} (you)` : name}
      type={clickable ? 'button' : undefined}
    >
      <Avatar url={avatarUrl} name={name} size={20} accent={accent} ring={isTurn} />
      <span className="max-w-[60px] sm:max-w-[120px] truncate">
        {shortName}
        {isYou && <span className="opacity-70 ms-1 hidden sm:inline">(you)</span>}
      </span>
    </Outer>
  );
}

function RematchModal({
  winner,
  myPlayerNumber,
  isMyMatch,
  iAmReady,
  opponentReady,
  onReady,
  onLeave,
  onDismiss,
  theme,
  opponentName,
}: {
  winner: Player;
  myPlayerNumber: Player | null;
  isMyMatch: boolean;
  iAmReady: boolean;
  opponentReady: boolean;
  onReady: () => void;
  onLeave: () => void;
  onDismiss: () => void;
  theme: Theme;
  opponentName: string;
}) {
  const isP1 = winner === 1;
  const winnerColor = isP1 ? theme.p1Color : theme.p2Color;
  const iWon = myPlayerNumber !== null && myPlayerNumber === winner;
  const iLost = myPlayerNumber !== null && myPlayerNumber !== winner;
  const headlineColor = iWon
    ? winnerColor
    : iLost
    ? '#fb7185' // soft rose for defeat
    : winnerColor; // spectator → neutral, winner-tinted

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center px-3"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
    >
      <motion.div
        initial={{ scale: 0.7, y: -40 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 16, stiffness: 220 }}
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-md w-full rounded-3xl overflow-hidden p-6 sm:p-8 text-center"
        style={{
          background: iLost
            ? `linear-gradient(135deg, rgba(120,40,60,0.35), ${theme.bgGradient})`
            : `linear-gradient(135deg, ${winnerColor}30, ${theme.bgGradient})`,
          border: `2px solid ${iLost ? '#fb7185' : winnerColor}`,
          color: theme.textPrimary,
        }}
      >
        <button
          onClick={onDismiss}
          aria-label="Close"
          className="absolute top-3 right-3 z-20 rounded-full w-8 h-8 flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-white/10 transition"
        >
          ✕
        </button>

        <motion.div
          animate={iWon
            ? { y: [0, -10, 0], rotate: [-4, 4, -4] }
            : iLost
            ? { y: [0, 4, 0] }
            : { y: [0, -8, 0] }
          }
          transition={{ duration: iLost ? 1.4 : 2.2, repeat: Infinity, ease: 'easeInOut' }}
          className="text-6xl mb-3"
        >
          {iWon ? '👑' : iLost ? '😕' : '🏁'}
        </motion.div>
        <h1 className="text-3xl font-extrabold mb-1" style={{ color: headlineColor }}>
          {iWon ? 'VICTORY!' : iLost ? 'DEFEAT' : 'GAME OVER'}
        </h1>
        <div className="text-base font-semibold mb-1 opacity-90">
          {iWon
            ? 'You claim the Throne 👑'
            : iLost
            ? `${opponentName} took it this time.`
            : `Player ${winner} wins.`}
        </div>
        <div className="text-sm opacity-60 mb-5">
          {isP1 ? '⚔️ Golden Lion victory' : '🛡️ Silver Lion victory'}
        </div>

        {isMyMatch ? (
          <>
            <button
              onClick={onReady}
              className="w-full rounded-xl py-3 text-lg font-extrabold mb-2 transition-transform active:scale-95"
              style={{
                background: iAmReady ? theme.p1AccentBg : theme.buttonRotateBg,
                border: `2px solid ${iAmReady ? theme.p1Color : theme.buttonRotateBorder}`,
                color: iAmReady ? theme.p1Color : theme.buttonRotateText,
              }}
            >
              {iAmReady ? '✓ Ready — waiting for opponent…' : '🔁 Ready for rematch'}
            </button>
            <div className="text-xs opacity-70 mb-3 flex items-center justify-center gap-3">
              <span>You: {iAmReady ? '✅' : '⬜'}</span>
              <span>{opponentName}: {opponentReady ? '✅' : '⬜'}</span>
            </div>
          </>
        ) : (
          <div className="text-sm opacity-70 mb-4">Spectator view — players can choose to rematch.</div>
        )}

        <div className="flex gap-2 justify-center">
          <button
            onClick={onDismiss}
            className="px-4 py-2 rounded-lg font-semibold text-sm"
            style={{ background: theme.buttonBg, border: `1px solid ${theme.buttonBorder}`, color: theme.textPrimary }}
          >
            Review board
          </button>
          <button
            onClick={onLeave}
            className="px-4 py-2 rounded-lg font-semibold text-sm"
            style={{ background: theme.buttonBg, border: `1px solid ${theme.buttonBorder}`, color: theme.textPrimary }}
          >
            🏠 Lobby
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
