'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useResponsiveCellSize } from '@/hooks/useResponsiveCellSize';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { format } from '@/game/locales';
import {
  parsePuzzleSnapshot,
  puzzleSnapshotToState,
  type PuzzleMove,
  type PuzzleSnapshot,
} from '@/game/puzzleTypes';
import { simulatePuzzleMove } from '@/game/puzzleValidator';
import { applyMove, applyEndTurn, getValidMoves } from '@/game/logic';
import { chooseAiMove } from '@/game/ai';
import type { GameState, Orientation, Player, Position } from '@/game/types';
import { ORIENTATION_LABEL } from '@/game/constants';
import AuthBadge from '@/components/AuthBadge';
import NotificationBell from '@/components/NotificationBell';
import SettingsButton from '@/components/SettingsButton';
import LoadingEmojis from '@/components/LoadingEmojis';
import { markNewPuzzleNotificationsRead } from '@/lib/supabase/notifications';
// Type-only import — erased at build, so it doesn't pull the replayer chunk
// into the main bundle. Describes one ply of the revealed principal line.
import type { ReplayPly } from '@/components/PuzzleReplayer';

// Heavy chunks are only loaded once we know we have a puzzle to render.
const GameBoard = dynamic(() => import('@/components/GameBoard'), { ssr: false });
const PuzzleReplayer = dynamic(() => import('@/components/PuzzleReplayer'), { ssr: false });

// API shapes
interface TodayPuzzle {
  id: string;
  puzzle_date: string;
  position: PuzzleSnapshot;
  side_to_move: Player;
  difficulty: number;
  theme: string | null;
  title_en: string | null;
  title_ar: string | null;
  flavour_en: string | null;
  flavour_ar: string | null;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'no-puzzle' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; puzzle: TodayPuzzle }
  | { kind: 'error'; message: string };

type SubmitStatus = 'idle' | 'submitting' | 'wrong' | 'solved';

// Wrong-move detail: when the player submits a wrong attacker move,
// we keep the optimistic state on the board, then run the local hard
// AI to find a defender reply that refutes it (often the move that
// captures the player's lion). The result drives the inline
// Retry / I quit panel.
interface WrongDetail {
  /** The defender reply we played to show what they would do.
   *  Null means the AI couldn't pick anything (no legal reply, etc.).
   *  In practice the validator guarantees a legal reply exists. */
  defenderReply: PuzzleMove | null;
  /** True iff the defender's reply ends the game with the defender
   *  winning — used to swap the headline copy ("your lion was taken"
   *  vs the softer "their best reply spoils your plan"). */
  lionLost: boolean;
}

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
  const { theme, isRTL, t } = useSettings();
  const sideToMove = puzzle.side_to_move;

  // Live engine state. savedState is the snapshot before the player's
  // current attacker turn — restored on a wrong submission.
  const [state, setState] = useState<GameState>(() => puzzleSnapshotToState(puzzle.position));
  const [savedState, setSavedState] = useState<GameState>(state);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [validRotations, setValidRotations] = useState<Orientation[]>([]);
  // Tracks the player's in-progress attacker turn so we can compose the
  // PuzzleMove submission at End Turn time. For non-ant pieces the move
  // is submitted immediately and turnActions stays empty. For ants the
  // player can chain pre-rotate / move / post-rotate before pressing
  // End Turn (mirroring the main-game ant flow).
  const [turnActions, setTurnActions] = useState<{
    preRotateTo?: Orientation;
    movedTo?: Position;
    postRotateTo?: Orientation;
  }>({});
  // True once an ant has either moved OR rotated this turn — clicking
  // other cells is locked until End Turn (matches useGame's antLock).
  const [antTurnInProgress, setAntTurnInProgress] = useState(false);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [wrongCount, setWrongCount] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showGiveUpConfirm, setShowGiveUpConfirm] = useState(false);
  const [revealedLine, setRevealedLine] = useState<ReplayPly[] | null>(null);
  // Detail for the wrong-move panel — populated only while status==='wrong'.
  const [wrongDetail, setWrongDetail] = useState<WrongDetail | null>(null);
  const submittingRef = useRef(false);

  /** Reset all per-turn scaffolding. Called whenever the player's turn
   *  ends (cleanly or after a wrong submission revert). */
  const resetTurn = useCallback(() => {
    setSelectedPieceId(null);
    setValidMoves([]);
    setValidRotations([]);
    setTurnActions({});
    setAntTurnInProgress(false);
  }, []);

  // Cell-size sizing to match the main game's responsive math.
  const cellSize = useResponsiveCellSize((vw, vh) => {
    const sideBySide = vw >= 1024;
    const padX = vw < 380 ? 6 : sideBySide ? 12 : 20;
    const sideReserve = sideBySide ? 280 : 0;
    const widthBudget = vw - padX * 2 - sideReserve - (sideBySide ? 12 : 0);
    const maxFromW = Math.floor(widthBudget / 16.6);
    const padY = sideBySide ? 60 : 200;
    const maxFromH = Math.floor((vh - padY) / 16.6);
    const minCell = vw < 360 ? 14 : 16;
    const maxCell = sideBySide ? 64 : 56;
    return Math.max(minCell, Math.min(maxCell, maxFromW, maxFromH));
  }, { initial: 36, layout: false });

  // Make sure /start has been called so started_at reflects open-time.
  useEffect(() => {
    void fetch(`/api/puzzles/${puzzle.id}/start`, { method: 'POST' }).catch(() => {});
  }, [puzzle.id]);

  // Silence the "today's puzzle is up" bell entry once the player is
  // actually on the page. Best-effort; failure is harmless (the row
  // just stays unread until the next visit).
  const { user } = useUser();
  useEffect(() => {
    if (!user) return;
    void markNewPuzzleNotificationsRead(user.id).catch(() => {});
  }, [user]);

  // The visual state we hand to the board — adds selection + valid-move
  // highlights so the existing GameBoard component renders them as it
  // does in the main game.
  const displayState = useMemo<GameState>(() => ({
    ...state,
    selectedPieceId,
    validMoves,
  }), [state, selectedPieceId, validMoves]);

  // Board is locked while submitting, after a wrong move (player must
  // hit Retry/Quit before clicking again), once solved, or once the
  // give-up replay has taken over.
  const locked = status === 'submitting'
    || status === 'wrong'
    || status === 'solved'
    || revealedLine !== null;
  const isPlayerTurn = state.currentPlayer === sideToMove && state.phase === 'playing';

  const submitMove = useCallback(async (move: PuzzleMove, optimisticState: GameState) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setStatus('submitting');
    setFeedback(null);
    try {
      const res = await fetch(`/api/puzzles/${puzzle.id}/move`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ move }),
      });
      if (!res.ok) {
        // Engine drift, expired attempt, etc. Roll the board back.
        setState(savedState);
        resetTurn();
        setStatus('idle');
        const body = await res.json().catch(() => ({}));
        setFeedback(body?.error ?? `Error ${res.status}`);
        return;
      }
      const data = await res.json() as {
        result: 'wrong' | 'continue' | 'solved' | 'already-solved';
        defenderReply?: PuzzleMove | null;
        principalLine?: ReplayPly[];
      };
      if (data.result === 'wrong') {
        // KEEP the optimistic state on the board (the player's wrong
        // attacker move stays applied) and run the local hard AI to
        // pick a defender reply that refutes it. Showing the
        // refutation on the board is the whole point of this branch:
        // the player gets to see WHY their move loses (usually their
        // lion getting taken), instead of a silent revert. Retry / I
        // quit live in the side panel so the player can choose.
        setWrongCount(c => c + 1);
        resetTurn();
        // Quick "showing reply" feedback; replaced once the AI returns.
        setFeedback(t('puzzle.thinkingReply'));
        const defenderSide = (3 - sideToMove) as Player;
        // Yield once so React paints the optimistic state + feedback
        // toast before chooseAiMove blocks for ~1.8s.
        await new Promise(r => setTimeout(r, 0));
        let refuted: GameState = optimisticState;
        let reply: PuzzleMove | null = null;
        try {
          const ai = chooseAiMove(optimisticState, defenderSide, 'lion');
          if (ai) {
            reply = { pieceId: ai.pieceId, target: ai.target, rotateTo: ai.rotateTo };
            refuted = simulatePuzzleMove(optimisticState, reply);
          }
        } catch {
          // AI couldn't find a reply — fall back to just the wrong attacker
          // state without a defender follow-up. The player still sees their
          // own move on the board and the Retry / I quit panel.
        }
        const lionLost = refuted.phase === 'won' && refuted.winner === defenderSide;
        setState(refuted);
        setWrongDetail({ defenderReply: reply, lionLost });
        setFeedback(lionLost ? t('puzzle.wrongLionLost') : t('puzzle.wrongRefuted'));
        setStatus('wrong');
        return;
      }
      if (data.result === 'solved' || data.result === 'already-solved') {
        setStatus('solved');
        setFeedback(t('puzzle.solved'));
        if (Array.isArray(data.principalLine)) setRevealedLine(data.principalLine);
        return;
      }
      // 'continue' — apply the canonical defender reply, then reopen the
      // board for the next attacker move.
      let next = optimisticState;
      if (data.defenderReply) {
        try {
          next = simulatePuzzleMove(optimisticState, data.defenderReply);
        } catch {
          // Should never happen — server-supplied moves are validated by
          // construction. Fail safe by leaving the board where it is.
        }
      }
      setState(next);
      setSavedState(next);
      resetTurn();
      setStatus('idle');
    } finally {
      submittingRef.current = false;
    }
  }, [puzzle.id, savedState, sideToMove, t, resetTurn]);

  const onCellClick = useCallback((row: number, col: number) => {
    if (locked || !isPlayerTurn) return;
    // While an ant turn is in progress, the only legal next actions are
    // Rotate or End Turn (HUD-driven). Cell clicks would otherwise let
    // the player switch pieces or "snap back" mid-turn — useGame
    // explicitly forbids both for ants and we mirror that here.
    if (antTurnInProgress) return;
    // Any new click clears the previous feedback toast so it doesn't
    // hover stale over the board mid-attempt. Wrong-state itself locks
    // the board (handled above via `locked`) and is exited by the
    // Retry / I quit buttons in the side panel, not by a cell click.
    if (feedback) setFeedback(null);

    // Click on a valid target with a piece selected — make the move.
    if (selectedPieceId) {
      const isValid = validMoves.some(m => m.row === row && m.col === col);
      if (isValid) {
        const piece = state.pieces.find(p => p.id === selectedPieceId);
        if (!piece) return;

        // Non-ant: applyMove flips the turn, submit the PuzzleMove
        // immediately. Carry any pre-rotation that was queued (n/a for
        // non-ants but harmless to merge).
        if (piece.type !== 'ant') {
          let optimistic: GameState;
          try {
            optimistic = applyMove(state, selectedPieceId, row, col);
          } catch {
            setFeedback('That move isn’t legal.');
            return;
          }
          const move: PuzzleMove = { pieceId: selectedPieceId, target: { row, col } };
          setSavedState(state);
          setState(optimistic);
          resetTurn();
          void submitMove(move, optimistic);
          return;
        }

        // Ant: applyMove leaves the turn open. Capture the move target
        // and the post-move valid rotations so the player can decide
        // what to rotate to (or just End Turn). We DO NOT submit yet.
        let afterMove: GameState;
        try {
          afterMove = applyMove(state, selectedPieceId, row, col);
        } catch {
          setFeedback('That move isn’t legal.');
          return;
        }
        // First piece-click of the turn → snapshot the pre-turn state.
        if (!antTurnInProgress && Object.keys(turnActions).length === 0) {
          setSavedState(state);
        }
        setState(afterMove);
        setTurnActions(t => ({ ...t, movedTo: { row, col } }));
        setAntTurnInProgress(true);
        setSelectedPieceId(selectedPieceId); // keep ant selected for HUD
        setValidMoves([]); // ant can't move twice
        setValidRotations(afterMove.validRotations ?? []);
        return;
      }
    }

    // Otherwise treat the click as a selection on a piece of the player's side.
    const piece = state.pieces.find(p => p.row === row && p.col === col && p.player === sideToMove);
    if (!piece) {
      setSelectedPieceId(null);
      setValidMoves([]);
      setValidRotations([]);
      return;
    }
    const { moves, validRotations: vr } = getValidMoves(piece, state.pieces);
    setSelectedPieceId(piece.id);
    setValidMoves(moves);
    setValidRotations(piece.type === 'ant' ? vr : []);
  }, [
    locked, isPlayerTurn, antTurnInProgress, selectedPieceId, validMoves,
    state, sideToMove, submitMove, feedback, status, turnActions, resetTurn,
  ]);

  /** Rotate the selected ant to the given orientation. Mirrors
   *  useGame.rotateAntTo: legal rotations only, recomputes valid moves
   *  from the new orientation when no positional move has happened yet
   *  so the player can rotate-then-move. */
  const onRotateAntTo = useCallback((targetOrientation: Orientation) => {
    if (locked || !isPlayerTurn) return;
    if (!selectedPieceId) return;
    const piece = state.pieces.find(p => p.id === selectedPieceId);
    if (!piece || piece.type !== 'ant') return;
    if (!validRotations.includes(targetOrientation)) return;

    const newPieces = state.pieces.map(p =>
      p.id === selectedPieceId ? { ...p, orientation: targetOrientation } : p,
    );
    const updatedPiece = { ...piece, orientation: targetOrientation };
    const after = getValidMoves(updatedPiece, newPieces);
    const newState: GameState = {
      ...state,
      pieces: newPieces,
      antHasRotated: true,
    };

    // First action of the turn → snapshot pre-turn state. The check
    // matches the one in onCellClick so the snapshot is taken exactly
    // once, regardless of which action came first.
    if (!antTurnInProgress && Object.keys(turnActions).length === 0) {
      setSavedState(state);
    }
    setState(newState);
    setAntTurnInProgress(true);
    // If the ant has already moved this turn, this is a post-rotation;
    // otherwise it's a pre-rotation that may be followed by a move.
    setTurnActions(prev => prev.movedTo
      ? { ...prev, postRotateTo: targetOrientation }
      : { ...prev, preRotateTo: targetOrientation });
    // After a pre-rotation the ant can still move from the new orientation —
    // expose those moves. After a post-rotation moves stay empty (already
    // moved this turn).
    setValidMoves(turnActions.movedTo ? [] : after.moves);
    setValidRotations(after.validRotations);
  }, [locked, isPlayerTurn, selectedPieceId, state, validRotations, antTurnInProgress, turnActions]);

  /** End the player's attacker turn. Composes the PuzzleMove from the
   *  accumulated turnActions, applies applyEndTurn locally, and
   *  submits. Refused if no action was taken (matches useGame). */
  const onEndTurn = useCallback(() => {
    if (locked || !isPlayerTurn) return;
    if (!selectedPieceId) return;
    const piece = state.pieces.find(p => p.id === selectedPieceId);
    if (!piece || piece.type !== 'ant') return;
    if (!turnActions.movedTo && !turnActions.preRotateTo) return;

    let move: PuzzleMove;
    if (turnActions.movedTo) {
      move = {
        pieceId: selectedPieceId,
        target: turnActions.movedTo,
        ...(turnActions.preRotateTo ? { preRotateTo: turnActions.preRotateTo } : {}),
        ...(turnActions.postRotateTo ? { rotateTo: turnActions.postRotateTo } : {}),
      };
    } else {
      // Rotate-only: no positional move, the ant rotated in place. The
      // chosen orientation is the one we last rotated to (preRotateTo
      // in turnActions because the move never happened to flip us into
      // post-mode).
      move = {
        pieceId: selectedPieceId,
        target: { row: piece.row, col: piece.col },
        rotateTo: turnActions.preRotateTo!,
        rotateOnly: true,
      };
    }

    let optimistic: GameState;
    try {
      optimistic = applyEndTurn(state);
    } catch {
      setFeedback('Could not end turn.');
      return;
    }
    setState(optimistic);
    resetTurn();
    void submitMove(move, optimistic);
  }, [locked, isPlayerTurn, selectedPieceId, state, turnActions, submitMove, resetTurn]);

  const onGiveUp = useCallback(async () => {
    setShowGiveUpConfirm(false);
    setStatus('submitting');
    setFeedback(null);
    setWrongDetail(null);
    try {
      const res = await fetch(`/api/puzzles/${puzzle.id}/give-up`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data?.principalLine)) setRevealedLine(data.principalLine);
      else setRevealedLine([]);
    } finally {
      setStatus('idle');
    }
  }, [puzzle.id]);

  // Roll the board back to the position before the player's wrong
  // attacker move. Used by the inline Retry button shown on the
  // wrong-move panel so they can try a different move without
  // navigating away.
  const onRetry = useCallback(() => {
    setState(savedState);
    resetTurn();
    setWrongDetail(null);
    setFeedback(null);
    setStatus('idle');
  }, [savedState, resetTurn]);

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
