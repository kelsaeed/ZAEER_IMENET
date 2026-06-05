'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { format } from '@/game/locales';
import { parsePuzzleSnapshot } from '@/game/puzzleTypes';
import { ORIENTATION_LABEL } from '@/game/constants';
import AuthBadge from '@/components/AuthBadge';
import NotificationBell from '@/components/NotificationBell';
import SettingsButton from '@/components/SettingsButton';
import LoadingEmojis from '@/components/LoadingEmojis';
// Type-only import — erased at build, so it doesn't pull the replayer chunk
// into the main bundle. Describes one ply of the revealed principal line.
import type { ReplayPly } from '@/components/PuzzleReplayer';
import { usePuzzleSession, type TodayPuzzle } from './usePuzzleSession';
import { earnedFromPuzzle } from '@/game/achievements';
import { unlock } from '@/lib/achievements';

// Heavy chunks are only loaded once we know we have a puzzle to render.
const GameBoard = dynamic(() => import('@/components/GameBoard'), { ssr: false });
const PuzzleReplayer = dynamic(() => import('@/components/PuzzleReplayer'), { ssr: false });
const AchievementToast = dynamic(() => import('@/components/AchievementToast'), { ssr: false });

type LoadState =
  | { kind: 'loading' }
  | { kind: 'no-puzzle' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; puzzle: TodayPuzzle }
  | { kind: 'error'; message: string };

export default function PuzzlePage() {
  const { user, profile, loading: userLoading } = useUser();
  const { theme, isRTL, t, localeId } = useSettings();
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });

  // Fetch today's puzzle on mount.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/puzzles/today')
      .then(async res => {
        if (cancelled) return;
        if (res.status === 404) { setLoad({ kind: 'no-puzzle' }); return; }
        if (res.status === 503) { setLoad({ kind: 'unavailable' }); return; }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setLoad({ kind: 'error', message: body?.error ?? `HTTP ${res.status}` });
          return;
        }
        const data = await res.json();
        try {
          const parsed = parsePuzzleSnapshot(data.position);
          setLoad({ kind: 'ready', puzzle: { ...data, position: parsed } });
        } catch (e) {
          setLoad({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
        }
      })
      .catch(e => { if (!cancelled) setLoad({ kind: 'error', message: e.message }); });
    return () => { cancelled = true; };
  }, []);

  const isAdmin = !!profile?.is_admin;

  // Top chrome shared across every state. Admins get a "Puzzle
  // studio" pill next to the back arrow so they can jump into the
  // composer from anywhere on the daily puzzle page — including
  // when the page is showing "no puzzle today".
  const chrome = (
    <>
      <Link
        href="/"
        aria-label={t('puzzle.backToMenu')}
        className="fixed top-3 z-30 rounded-full text-xl flex items-center justify-center transition-transform hover:scale-110"
        style={{
          [isRTL ? 'right' : 'left']: 12,
          width: 40, height: 40,
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
          color: theme.textPrimary,
        } as React.CSSProperties}
      >
        ←
      </Link>
      {isAdmin && (
        <Link
          href="/admin/puzzles"
          className="fixed top-3 z-30 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-transform hover:scale-105"
          style={{
            [isRTL ? 'right' : 'left']: 64,
            background: theme.p2AccentBg,
            border: `1px solid ${theme.p2AccentBorder}`,
            color: theme.p2Color,
            backdropFilter: 'blur(6px)',
            top: 14,
          } as React.CSSProperties}
        >
          🛡️ {t('admin.puzzles.openCta')}
        </Link>
      )}
      <div
        className="fixed top-3 z-30 flex items-center gap-2"
        style={{ [isRTL ? 'left' : 'right']: 12 } as React.CSSProperties}
      >
        <SettingsButton variant="inline" />
        <NotificationBell />
        <AuthBadge side={isRTL ? 'left' : 'right'} />
      </div>
    </>
  );

  return (
    <main
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen w-full flex flex-col items-center justify-center px-3 sm:px-6 py-12 pt-16"
      style={{ minHeight: '100dvh', background: theme.bgGradient, color: theme.textPrimary }}
    >
      {chrome}

      {load.kind === 'loading' && <CenteredCard><LoadingEmojis /></CenteredCard>}
      {load.kind === 'no-puzzle' && (
        <CenteredCard>
          <p style={{ marginBottom: isAdmin ? 16 : 0 }}>{t('puzzle.noToday')}</p>
          {isAdmin && (
            <Link
              href="/admin/puzzles/new"
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                borderRadius: 12,
                background: theme.p1AccentBg,
                border: `1px solid ${theme.p1AccentBorder}`,
                color: theme.p1Color,
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              🛡️ {t('puzzle.createToday')}
            </Link>
          )}
        </CenteredCard>
      )}
      {load.kind === 'unavailable' && <CenteredCard>{t('puzzle.unavailable')}</CenteredCard>}
      {load.kind === 'error' && <CenteredCard>{load.message}</CenteredCard>}

      {load.kind === 'ready' && !userLoading && !user && (
        <CenteredCard>
          <p style={{ marginBottom: 12 }}>{t('puzzle.signInToPlay')}</p>
          <Link
            href="/login"
            style={{
              display: 'inline-block',
              padding: '8px 18px',
              borderRadius: 12,
              background: theme.p1AccentBg,
              border: `1px solid ${theme.p1AccentBorder}`,
              color: theme.p1Color,
              fontWeight: 700,
            }}
          >
            {t('puzzle.signIn')}
          </Link>
        </CenteredCard>
      )}

      {load.kind === 'ready' && user && (
        <PuzzleSession
          puzzle={load.puzzle}
          locale={localeId}
        />
      )}
    </main>
  );
}

// ─── Session ─────────────────────────────────────────────────────────────

interface PuzzleSessionProps {
  puzzle: TodayPuzzle;
  locale: string;
}

function PuzzleSession({ puzzle, locale }: PuzzleSessionProps) {
  const { theme, t } = useSettings();
  const sideToMove = puzzle.side_to_move;

  const {
    state, displayState, cellSize, onCellClick,
    revealedLine, feedback, status, wrongCount,
    isPlayerTurn, selectedPieceId, validRotations, turnActions,
    onRotateAntTo, onEndTurn, locked,
    wrongDetail, onRetry,
    showGiveUpConfirm, setShowGiveUpConfirm, onGiveUp,
  } = usePuzzleSession(puzzle);

  // Unlock puzzle achievements on solve (first solve + clean/no-wrong solve).
  const [newAchievements, setNewAchievements] = useState<string[]>([]);
  useEffect(() => {
    if (status !== 'solved') return;
    const fresh = unlock(earnedFromPuzzle(wrongCount));
    if (fresh.length) setNewAchievements(fresh);
  }, [status, wrongCount]);

  const title = locale === 'ar' && puzzle.title_ar
    ? puzzle.title_ar
    : (puzzle.title_en ?? t('puzzle.title'));
  const flavour = locale === 'ar' && puzzle.flavour_ar
    ? puzzle.flavour_ar
    : (puzzle.flavour_en ?? '');
  const turnLabel = sideToMove === 1 ? t('puzzle.yourTurnP1') : t('puzzle.yourTurnP2');

  return (
    <div className="w-full flex flex-col lg:flex-row items-center lg:items-start justify-center gap-4 lg:gap-6">
      <div className="flex flex-col items-center gap-2 relative">
        {/* The replayer takes over the board area whenever there's a
            principal line to walk through (after solve OR after give-up).
            The text-list reveal in the side panel stays as a fallback so
            anyone with reduced motion / no JS-y animation still gets the
            full answer. */}
        {revealedLine && revealedLine.length > 0 ? (
          <PuzzleReplayer
            snapshot={puzzle.position}
            line={revealedLine}
            cellSize={cellSize}
          />
        ) : (
          <GameBoard state={displayState} cellSize={cellSize} onCellClick={onCellClick} />
        )}
        {/* Status banner above the board so feedback never collides with
            the corner buttons. */}
        <AnimatePresence>
          {feedback && (
            <motion.div
              key={feedback}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="absolute top-2 left-1/2 -translate-x-1/2 z-20 rounded-full px-4 py-1.5 text-sm font-semibold pointer-events-none"
              style={{
                background: theme.panelBg,
                border: `1px solid ${status === 'wrong' ? theme.p2AccentBorder : theme.p1AccentBorder}`,
                color: status === 'wrong' ? theme.p2Color : theme.p1Color,
                backdropFilter: 'blur(6px)',
                whiteSpace: 'nowrap',
              }}
            >
              {feedback}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Side panel */}
      <aside
        className="w-full max-w-md lg:w-72 flex flex-col gap-3"
        style={{ color: theme.textPrimary }}
      >
        <header
          className="rounded-2xl p-4"
          style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
        >
          <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>
            {puzzle.puzzle_date} · {'★'.repeat(puzzle.difficulty)}
            {puzzle.theme ? ` · ${puzzle.theme}` : ''}
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: theme.p1Color, marginBottom: 4 }}>
            {title}
          </h1>
          <div style={{ fontSize: 13, color: theme.textPrimary }}>{turnLabel}</div>
          {flavour && (
            <p style={{ marginTop: 8, fontSize: 12, color: theme.textMuted }}>{flavour}</p>
          )}
        </header>

        <div
          className="rounded-2xl p-3 flex items-center justify-between"
          style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, fontSize: 13 }}
        >
          <span style={{ color: theme.textMuted }}>
            {format(t('puzzle.wrongCount'), { n: wrongCount })}
          </span>
          <StreakChip />
        </div>

        {/* Ant control panel — only renders when an ant is selected and
            either has rotation options to offer or has already taken an
            action that needs an explicit End Turn. */}
        {isPlayerTurn && selectedPieceId && state.pieces.find(p => p.id === selectedPieceId)?.type === 'ant'
          && (validRotations.length > 0 || turnActions.movedTo || turnActions.preRotateTo) && (
          <div
            className="rounded-2xl p-3 flex flex-col gap-2"
            style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, fontSize: 13 }}
          >
            {validRotations.length > 0 && (
              <>
                <span style={{ color: theme.textMuted, fontSize: 12 }}>Rotate ant</span>
                <div className="flex flex-wrap gap-1">
                  {validRotations.map(ori => (
                    <button
                      key={ori}
                      onClick={() => onRotateAntTo(ori)}
                      disabled={locked}
                      className="px-2 py-1 rounded-lg font-semibold transition-transform hover:scale-[1.02] disabled:opacity-50"
                      style={{
                        background: theme.panelBg,
                        border: `1px solid ${theme.p1AccentBorder}`,
                        color: theme.p1Color,
                        fontSize: 12,
                      }}
                    >
                      ↻ {ORIENTATION_LABEL[ori]}
                    </button>
                  ))}
                </div>
              </>
            )}
            {(turnActions.movedTo || turnActions.preRotateTo) && (
              <button
                onClick={onEndTurn}
                disabled={locked}
                className="rounded-lg px-3 py-2 font-bold transition-transform hover:scale-[1.02] disabled:opacity-50"
                style={{
                  background: theme.p1AccentBg,
                  border: `1px solid ${theme.p1AccentBorder}`,
                  color: theme.p1Color,
                  fontSize: 13,
                }}
              >
                End turn
              </button>
            )}
          </div>
        )}

        {/* Wrong-move panel — replaces the bottom give-up button while
            the player is staring at the defender's refutation. Retry
            rolls the board back; I quit reveals the canonical line. */}
        {status === 'wrong' && wrongDetail && !revealedLine && (
          <WrongMovePanel
            lionLost={wrongDetail.lionLost}
            onRetry={onRetry}
            onGiveUp={() => setShowGiveUpConfirm(true)}
          />
        )}

        {status === 'solved' && (
          <SolvedCard
            onMenu={() => location.assign('/')}
            onPlayAgain={() => location.reload()}
            wrongCount={wrongCount}
            puzzleDate={puzzle.puzzle_date}
          />
        )}

        {/* Text fallback for the principal line — shown whenever a line
            is available (solved OR gave-up). The replayer above is the
            primary view; this list is the always-readable backup. */}
        {revealedLine && revealedLine.length > 0 && (
          <RevealCard line={revealedLine} pieces={state.pieces} />
        )}

        {status !== 'solved' && status !== 'wrong' && !revealedLine && (
          <button
            onClick={() => setShowGiveUpConfirm(true)}
            disabled={locked}
            className="rounded-2xl px-4 py-3 font-bold transition-transform hover:scale-[1.02] disabled:opacity-50"
            style={{
              background: theme.panelBg,
              border: `1px solid ${theme.p2AccentBorder}`,
              color: theme.p2Color,
              fontSize: 14,
            }}
          >
            {t('puzzle.giveUp')}
          </button>
        )}

        <Link
          href="/"
          className="text-center text-sm rounded-2xl px-4 py-2"
          style={{ color: theme.textMuted, border: `1px solid ${theme.panelBorder}` }}
        >
          {t('puzzle.backToMenu')}
        </Link>
      </aside>

      <AnimatePresence>
        {showGiveUpConfirm && (
          <ConfirmDialog
            text={t('puzzle.giveUpConfirm')}
            confirmLabel={t('puzzle.showHow')}
            cancelLabel={t('puzzle.backToMenu')}
            onConfirm={onGiveUp}
            onCancel={() => setShowGiveUpConfirm(false)}
          />
        )}
      </AnimatePresence>

      <AchievementToast ids={newAchievements} onDone={() => setNewAchievements([])} />
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────

function CenteredCard({ children }: { children: React.ReactNode }) {
  const { theme } = useSettings();
  return (
    <div
      className="rounded-2xl p-6 max-w-md text-center"
      style={{
        background: theme.panelBg,
        border: `1px solid ${theme.panelBorder}`,
        color: theme.textPrimary,
      }}
    >
      {children}
    </div>
  );
}

function StreakChip() {
  const { theme, t } = useSettings();
  const { profile } = useUser();
  const streak = profile?.puzzle_current_streak ?? 0;
  if (streak <= 0) return null;
  return (
    <span
      style={{
        background: theme.p1AccentBg,
        border: `1px solid ${theme.p1AccentBorder}`,
        color: theme.p1Color,
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      🔥 {format(t('puzzle.streak'), { n: streak })}
    </span>
  );
}

function SolvedCard({
  onMenu,
  onPlayAgain,
  wrongCount,
  puzzleDate,
}: {
  onMenu: () => void;
  onPlayAgain: () => void;
  wrongCount: number;
  puzzleDate: string;
}) {
  const { theme, t } = useSettings();
  const [copied, setCopied] = useState(false);

  // Share line. Picks a flavour based on wrongCount so a clean
  // first-try solve reads differently from a hard-fought one. The
  // shared URL points at /puzzle (today's puzzle) — the OG image at
  // /puzzle/opengraph-image is generated server-side off the live
  // puzzle position so the friend sees the actual board.
  async function handleShare() {
    const url = typeof window !== 'undefined' ? `${window.location.origin}/puzzle` : 'https://zaeer-imenet.vercel.app/puzzle';
    const headline = wrongCount === 0
      ? `🏆 Solved today's Zaeer Imenet puzzle on the first try!`
      : `🏆 Solved today's Zaeer Imenet puzzle (${wrongCount + 1} tries).`;
    const text = `${headline} Try it: ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Daily Puzzle', text, url });
        return;
      }
    } catch {
      // User cancelled or share unavailable — fall through to copy.
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard blocked — silent */
    }
  }

  return (
    <motion.div
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl p-4 text-center"
      style={{
        background: `linear-gradient(180deg, ${theme.p1AccentBg}, ${theme.panelBg})`,
        border: `1px solid ${theme.p1AccentBorder}`,
        color: theme.textPrimary,
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 4 }}>🏆</div>
      <div style={{ fontWeight: 800, fontSize: 18, color: theme.p1Color, marginBottom: 4 }}>
        {t('puzzle.solved')}
      </div>
      <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 10 }}>
        {puzzleDate}
      </div>
      <div className="flex gap-2 justify-center flex-wrap">
        <button onClick={handleShare} style={smallBtnAccent(theme)}>
          {copied ? `✓ ${t('puzzle.shareCopied')}` : `📤 ${t('puzzle.share')}`}
        </button>
        <button onClick={onMenu} style={smallBtn(theme)}>{t('puzzle.backToMenu')}</button>
        <button onClick={onPlayAgain} style={smallBtn(theme)}>↻</button>
      </div>
    </motion.div>
  );
}

/** Inline panel shown right after a wrong attacker move, with the
 *  defender's refuting reply already drawn on the board. Two buttons:
 *  Retry (rolls the board back to before the player's move) and I quit
 *  (calls /give-up and reveals the canonical winning line). */
function WrongMovePanel({
  lionLost,
  onRetry,
  onGiveUp,
}: {
  lionLost: boolean;
  onRetry: () => void;
  onGiveUp: () => void;
}) {
  const { theme, t } = useSettings();
  return (
    <motion.div
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.22 }}
      className="rounded-2xl p-4 text-center"
      style={{
        background: `linear-gradient(180deg, ${theme.p2AccentBg}, ${theme.panelBg})`,
        border: `1px solid ${theme.p2AccentBorder}`,
        color: theme.textPrimary,
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 4 }}>{lionLost ? '☠️' : '⚠️'}</div>
      <div style={{ fontWeight: 800, fontSize: 14, color: theme.p2Color, marginBottom: 12 }}>
        {lionLost ? t('puzzle.wrongLionLost') : t('puzzle.wrongRefuted')}
      </div>
      <div className="flex gap-2 justify-center flex-wrap">
        <button onClick={onRetry} style={smallBtnAccent(theme)}>
          {t('puzzle.retry')}
        </button>
        <button onClick={onGiveUp} style={smallBtn(theme)}>
          {t('puzzle.giveUp')}
        </button>
      </div>
    </motion.div>
  );
}

function RevealCard({ line, pieces }: { line: ReplayPly[]; pieces: { id: string; type: string }[] }) {
  const { theme, t } = useSettings();
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, color: theme.textPrimary }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14, color: theme.p1Color }}>
        {t('puzzle.showingSolution')}
      </div>
      <ol style={{ margin: 0, paddingInlineStart: 18, fontSize: 13, color: theme.textPrimary, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {line.map((ply, i) => {
          const piece = pieces.find(pp => pp.id === ply.move?.pieceId);
          const what = piece?.type ?? ply.move?.pieceId ?? '?';
          const t2 = ply.move?.target;
          return (
            <li key={i} style={{ opacity: ply.side === 'attacker' ? 1 : 0.7 }}>
              <strong style={{ color: ply.side === 'attacker' ? theme.p1Color : theme.p2Color }}>
                {ply.side === 'attacker' ? '▲' : '▽'}
              </strong>{' '}
              {what} → ({t2?.row ?? '?'}, {t2?.col ?? '?'})
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ConfirmDialog({
  text, confirmLabel, cancelLabel, onConfirm, onCancel,
}: {
  text: string; confirmLabel: string; cancelLabel: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  const { theme } = useSettings();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="rounded-2xl p-5 max-w-sm w-full text-center"
        style={{
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
          color: theme.textPrimary,
        }}
      >
        <p style={{ fontSize: 14, marginBottom: 16 }}>{text}</p>
        <div className="flex gap-2 justify-center">
          <button onClick={onCancel} style={smallBtn(theme)}>{cancelLabel}</button>
          <button onClick={onConfirm} style={smallBtnAccent(theme)}>{confirmLabel}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function smallBtn(theme: ReturnType<typeof useSettings>['theme']): React.CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: 12,
    background: theme.panelBg,
    border: `1px solid ${theme.panelBorder}`,
    color: theme.textPrimary,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  };
}
function smallBtnAccent(theme: ReturnType<typeof useSettings>['theme']): React.CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: 12,
    background: theme.p1AccentBg,
    border: `1px solid ${theme.p1AccentBorder}`,
    color: theme.p1Color,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  };
}
