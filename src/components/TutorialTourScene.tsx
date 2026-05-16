'use client';
import { useMemo } from 'react';
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

/** A non-interactive mock of the real in-game screen used by the opening
 *  UI tour. It renders the actual GameBoard and the actual GameHUD (so
 *  the tour can never drift from the real UI) with every callback
 *  no-op'd, then floats numbered badges over each region. The matching
 *  legend lives in `tutorial.tour.body` so the numbers are explained in
 *  the player's language. */
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

  // Numbered badge — a small circular chip. Positioned by the caller via
  // absolute coordinates inside each relatively-positioned column.
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
      {/* Board column */}
      <div className="relative shrink-0 mx-auto lg:mx-0" style={{ pointerEvents: 'none' }}>
        <GameBoard state={tourState} cellSize={tourCell} onCellClick={noop} />
        {/* ① the board itself */}
        <Badge n={1} style={{ top: -4, left: -4 }} />
        {/* ② pieces (player-1 lion sits near the bottom centre) */}
        <Badge n={2} style={{ bottom: tourCell * 0.4, left: `calc(50% + ${tourCell * 0.6}px)` }} />
        {/* ③ barriers (the 🌿 rows hug the throne) */}
        <Badge n={3} style={{ top: '50%', left: tourCell * 1.8 }} />
        {/* ④ throne (dead centre) */}
        <Badge n={4} style={{ top: '47%', left: '50%' }} />
      </div>

      {/* Side-panel column — the real GameHUD, every action inert. */}
      <div
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
        {/* ⑤ side panel (turn / last action / selected piece + rotation) */}
        <Badge n={5} style={{ top: -4, right: -4 }} />
        {/* ⑦ history review sits just under the last-action card */}
        <Badge n={7} style={{ top: '34%', right: -4 }} />
        {/* ⑥ life cycle legend + ⑦ menu / restart live near the bottom */}
        <Badge n={6} style={{ bottom: '20%', left: -4 }} />
      </div>
    </div>
  );
}
