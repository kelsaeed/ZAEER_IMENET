'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';

interface Props {
  /** True while the local player has an ant selected/moved with at
   *  least one valid rotation pending. */
  visible: boolean;
  /** Cell size in pixels — used to size the arrow so it always feels
   *  proportional to the board (a 28-px mobile cell and an 80-px
   *  desktop cell get visually consistent hints). */
  cellSize: number;
  /** Centre cell of the ant. The hint anchors here so a player who
   *  just moved their ant sees a giant arrow blooming out of it,
   *  not a pill at the bottom of the screen detached from the action. */
  antRow: number;
  antCol: number;
  /** Tapped/clicked → smooth-scroll the page to the rotation section
   *  in the HUD (id="zi-ant-rotation-section"). */
  onClick: () => void;
}

type Direction = 'down' | 'right' | 'left';

/** A large, translucent, pulsing arrow drawn in SVG, anchored inside
 *  the board. Clicking it smooth-scrolls (or no-ops on desktop where
 *  it's already visible) to the rotation / end-turn buttons in the
 *  HUD.
 *
 *  Direction follows the page layout:
 *    - mobile (<lg)        → arrow points DOWN  (HUD is below board)
 *    - desktop LTR (≥lg)   → arrow points RIGHT (HUD is to the right)
 *    - desktop RTL (≥lg)   → arrow points LEFT  (HUD is to the left)
 *
 *  Mounted INSIDE GameBoard so the position can be expressed in cell
 *  coordinates against the board's overflow:hidden + position:relative
 *  container — same pattern the tutorial pulse uses. */
export default function RotationHint({ visible, cellSize, antRow, antCol, onClick }: Props) {
  const { theme, t, isRTL } = useSettings();

  // Tailwind's `lg:` breakpoint is 1024 px. Track once on mount + on
  // resize; SSR falls back to mobile so the down-arrow renders if the
  // hydration JS never lands (graceful degradation).
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const update = () => setIsDesktop(window.innerWidth >= 1024);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const direction: Direction = isDesktop ? (isRTL ? 'left' : 'right') : 'down';

  // Position. Mobile keeps the opposite-half rule so the arrow never
  // sits on the ant or any valid-move square. Desktop places it on
  // the same row as the ant, hugging the side of the board where the
  // HUD lives — no scroll needed there, the arrow just nudges the
  // eye toward the controls.
  const labelOffset = cellSize * 0.5;
  let arrowRow: number;
  let arrowCol: number;
  if (direction === 'down') {
    arrowRow = antRow <= 7 ? 13 : 2;
    arrowCol = Math.max(1, Math.min(14, antCol));
  } else {
    arrowRow = Math.max(1, Math.min(14, antRow));
    arrowCol = direction === 'right' ? 14 : 1;
  }
  const cellCentreX = labelOffset + (arrowCol + 0.5) * cellSize;
  const cellCentreY = (arrowRow + 0.5) * cellSize;

  // Arrow box. The SVG is square-ish; the wrapper just needs to be
  // big enough for the arrow + the small label pill below.
  const w = cellSize * 1.8;
  const h = cellSize * 1.8;

  // Rotation + bob axis. The base SVG is a down-arrow; rotating ±90°
  // points it sideways. Bob runs along the arrow's pointing axis so
  // it always reads as "this way, please".
  const arrowRotation =
    direction === 'down' ? 0
    : direction === 'right' ? -90
    : 90;
  const bobAxis: 'x' | 'y' = direction === 'down' ? 'y' : 'x';
  const bobAmount = cellSize * 0.18 * (direction === 'left' ? -1 : 1);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key="rotation-hint"
          type="button"
          onClick={onClick}
          aria-label={t('hint.rotate')}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.22 }}
          className="absolute pointer-events-auto cursor-pointer"
          style={{
            top: cellCentreY - h / 2,
            left: cellCentreX - w / 2,
            width: w,
            height: h,
            background: 'transparent',
            border: 'none',
            padding: 0,
            zIndex: 30,
          }}
        >
          {/* Bobbing wrapper. The bob axis follows the arrow's
              direction so the motion feels intentional rather than
              an indistinct wobble. */}
          <motion.div
            animate={{ [bobAxis]: [0, bobAmount, 0] }}
            transition={{ duration: 1.0, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: cellSize * 0.08,
            }}
          >
            <svg
              viewBox="0 0 80 100"
              width={cellSize * 1.4}
              height={cellSize * 1.4}
              fill={theme.buttonRotateBg}
              stroke={theme.buttonRotateBorder}
              strokeWidth={3.5}
              strokeLinejoin="round"
              style={{
                filter: `drop-shadow(0 0 ${cellSize * 0.18}px ${theme.buttonRotateBorder})`,
                opacity: 0.92,
                // Rotate the SVG itself; the label below stays
                // upright so the text is always readable.
                transform: `rotate(${arrowRotation}deg)`,
              }}
              aria-hidden
            >
              {/* Stylised down-arrow: a wide head + a stubby shaft.
                  Drawn in SVG so it scales crisply at any cell size
                  and inherits the theme's accent colour. */}
              <path d="M30 6 L50 6 L50 48 L70 48 L40 88 L10 48 L30 48 Z" />
            </svg>
            <span
              className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap"
              style={{
                background: theme.buttonRotateBg,
                border: `1px solid ${theme.buttonRotateBorder}`,
                color: theme.buttonRotateText,
                opacity: 0.95,
                fontSize: Math.max(10, cellSize * 0.26),
              }}
            >
              {t('hint.rotate')}
            </span>
          </motion.div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
