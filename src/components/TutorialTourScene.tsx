'use client';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GameState } from '@/game/types';
import { getValidMoves } from '@/game/logic';
import { useSettings } from '@/hooks/useSettings';
import GameBoard from './GameBoard';
import GameHUD from './GameHUD';

interface Props {
  /** The representative position (STEP_TOUR.pieces wrapped in a state). */
  baseState: GameState;
  /** Cell size shared with the rest of the tutorial layout. The tour
   *  shows the board AND the full side panel side-by-side, so we cap it
   *  a little tighter than a normal lesson. */
  cellSize: number;
}

/** Where each HUD badge measured out to, in pixels relative to the
 *  side-panel wrapper. Empty until the first measure lands. */
type HudPos = Partial<Record<'turn' | 'history' | 'killcycle', { top: number; left: number }>>;

/** A non-interactive mock of the real in-game screen used by the opening
 *  UI tour. It renders the actual GameBoard and the actual GameHUD (so
 *  the tour can never drift from the real UI) with every callback
 *  no-op'd, then floats numbered badges over each region. The matching
 *  legend lives in `tutorial.tour.body` so the numbers are explained in
 *  the player's language.
 *
 *  Badge placement is anchored to the real UI, never guessed:
 *   - Board badges (①②③④) ride inside the grid on their exact cells
 *     (passed to GameBoard, same offset math as the tutorial pulse).
 *   - Side-panel badges (⑤⑥⑦) are measured off the real HUD sections
 *     (tagged with data-tour-id) so they sit on the right card no
 *     matter how the panel reflows. */
export default function TutorialTourScene({ baseState, cellSize }: Props) {
  const { theme } = useSettings();

  // Select the player-1 ant so the side panel shows the real rotation +
  // End-Turn controls (those are part of "the side panel" we point at).
  const tourState: GameState = useMemo(() => {
    const ant = baseState.pieces.find(p => p.type === 'ant' && p.player === 1);
    if (!ant) return baseState;
    const { validRotations } = getValidMoves(ant, baseState.pieces);
    return {
      ...baseState,
      selectedPieceId: ant.id,
      validRotations,
      canRotate: validRotations.length > 0,
      // Pretend the ant already moved this turn so the End-Turn button is
      // visible in the snapshot (it is gated on moved-or-rotated).
      antMovedThisTurn: true,
      lastAction: { key: 'tutorial.tour.sampleAction' },
    };
  }, [baseState]);

  // The tour shows the board AND the full side panel together, so the
  // board can't be as huge as a solo lesson — but it should still be
  // big and readable (the old 19px cap made it a postage stamp).
  const tourCell = Math.max(15, Math.min(cellSize, 40));
  const noop = () => {};

  // ① the board itself (top-left cell), ② your lion (bottom-centre),
  // ③ a south barrier cell, ④ the throne — all real cells, so the chip
  // lands exactly on what the legend describes.
  const boardBadges = [
    { n: 1, row: 0, col: 0 },
    { n: 2, row: 15, col: 7 },
    { n: 3, row: 9, col: 6 },
    { n: 4, row: 7, col: 8 },
  ];

  // Side-panel badges are measured off the live HUD after it renders.
  const panelRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<HudPos>({});

  useLayoutEffect(() => {
    const wrap = panelRef.current;
    if (!wrap) return;

    function measure() {
      const w = panelRef.current;
      if (!w) return;
      const base = w.getBoundingClientRect();
      const at = (id: string): DOMRect | null => {
        const el = w.querySelector<HTMLElement>(`[data-tour-id="${id}"]`);
        return el ? el.getBoundingClientRect() : null;
      };
      const turn = at('turn');
      const history = at('history');
      const killcycle = at('killcycle');
      setHud({
        // Top-right corner of the turn / history cards (the chip hugs
        // the corner, sticking slightly out like the side-panel ⑤).
        ...(turn && { turn: { top: turn.top - base.top - 8, left: turn.right - base.left - 14 } }),
        ...(history && { history: { top: history.top - base.top - 8, left: history.right - base.left - 14 } }),
        // Top-left corner of the kill-cycle legend.
        ...(killcycle && { killcycle: { top: killcycle.top - base.top - 8, left: killcycle.left - base.left - 8 } }),
      });
    }

    // Measure now, again after the HUD's entrance animation settles, and
    // on every reflow. ResizeObserver misses transform-only animations
    // (the turn card slides in via translate), hence the timed retries.
    measure();
    const t1 = window.setTimeout(measure, 120);
    const t2 = window.setTimeout(measure, 460);
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [tourState, cellSize]);

  // Numbered badge — a small circular chip positioned by the caller.
  const Badge = ({ n, style }: { n: number; style: React.CSSProperties }) => (
    <div
      aria-hidden
      className="absolute z-20 rounded-full flex items-center justify-center font-extrabold pointer-events-none"
      style={{
        width: 22,
        height: 22,
        fontSize: 12,
        background: theme.p1Color,
        color: '#000',
        boxShadow: `0 0 10px ${theme.p1Color}, 0 1px 3px rgba(0,0,0,0.5)`,
        ...style,
      }}
    >
      {n}
    </div>
  );

  return (
    <div
      // Faithful to the real game: board on one side, the full HUD on the
      // other (stacked on phones, side-by-side from lg). The whole thing
      // is inert — it's a labelled screenshot, not a playable board.
      className="w-full max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-start gap-4 lg:gap-6 justify-center"
    >
      {/* Board column — badges ①②③④ ride inside the grid on their cells. */}
      <div className="relative shrink-0 mx-auto lg:mx-0" style={{ pointerEvents: 'none' }}>
        <GameBoard state={tourState} cellSize={tourCell} onCellClick={noop} tourBadges={boardBadges} />
      </div>

      {/* Side-panel column — the real GameHUD, every action inert. The
          badges are measured off the real cards so they never drift. */}
      <div
        ref={panelRef}
        className="relative w-full max-w-md mx-auto lg:mx-0 lg:w-[clamp(13rem,16vw,20rem)]"
        style={{ pointerEvents: 'none' }}
      >
        <GameHUD
          state={tourState}
          reviewing={false}
          historyIndex={null}
          historyLength={8}
          onMainMenu={noop}
          onRestartMatch={noop}
          onRotateTo={noop}
          onEndTurn={noop}
          onSwitchToShieldedPiece={noop}
          onSwitchToShieldingButterfly={noop}
          onHistoryBack={noop}
          onHistoryForward={noop}
          onHistoryToLive={noop}
          onHistoryJumpTo={noop}
        />
        {/* ⑤ side panel header: turn / last action / selected-piece controls */}
        {hud.turn && <Badge n={5} style={{ top: hud.turn.top, left: hud.turn.left }} />}
        {/* ⑦ history review (restart / main-menu sit just below it) */}
        {hud.history && <Badge n={7} style={{ top: hud.history.top, left: hud.history.left }} />}
        {/* ⑥ kill-cycle reminder legend */}
        {hud.killcycle && <Badge n={6} style={{ top: hud.killcycle.top, left: hud.killcycle.left }} />}
      </div>
    </div>
  );
}
