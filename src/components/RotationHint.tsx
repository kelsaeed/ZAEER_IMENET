'use client';
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

/** A large, translucent, pulsing down-arrow drawn in SVG, anchored on
 *  the ant cell. Clicking it scrolls the user to the rotation /
 *  end-turn buttons in the HUD beneath the board.
 *
 *  Mounted INSIDE GameBoard so its position can be expressed in cell
 *  coordinates (top/left in pixels off the board grid container, which
 *  already has position: relative). The board's overflow: hidden
 *  clips the arrow visually if the ant is at the very edge — fine,
 *  whatever shows still tells the player "look down". */
export default function RotationHint({ visible, cellSize, antRow, antCol, onClick }: Props) {
  const { theme, t } = useSettings();
  // Anchor the arrow in the OPPOSITE half of the board from the ant
  // so it never sits on the ant or any valid-move square (the ant's
  // moves and rotations all live within ~4 cells of its centre).
  // Same column as the ant — clamped so the 1.6-cell-wide arrow box
  // doesn't run off the side — keeps the eye trail short: tap the
  // arrow you can see, scroll to the controls.
  const arrowRow = antRow <= 7 ? 13 : 2;
  const arrowCol = Math.max(1, Math.min(14, antCol));
  // Cell layout: the row label takes the first 0.5 cellSize column,
  // then 16 actual board cells.
  const labelOffset = cellSize * 0.5;
  const cellCentreX = labelOffset + (arrowCol + 0.5) * cellSize;
  const cellCentreY = (arrowRow + 0.5) * cellSize;
  // Arrow box: ~1.6 cells across, 2 cells tall — large enough to
  // read at a glance, small enough to leave the surrounding cells
  // visible (and pressable, on the rare chance a path of valid
  // moves brushes up against it).
  const w = cellSize * 1.6;
  const h = cellSize * 2.2;

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key="rotation-hint"
          type="button"
          onClick={onClick}
          aria-label={t('hint.rotateBelow')}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.22 }}
          className="absolute pointer-events-auto cursor-pointer"
          style={{
            // Anchor the centre of the arrow box on the ant centre.
            top: cellCentreY - h / 2,
            left: cellCentreX - w / 2,
            width: w,
            height: h,
            background: 'transparent',
            border: 'none',
            padding: 0,
            // High z so it sits above pieces (z=20) and the tutorial
            // pulse (z=5), but below modal overlays.
            zIndex: 30,
          }}
        >
          {/* Bobbing wrapper — own animation so it can run independently
              of the appear/disappear scale. */}
          <motion.div
            animate={{ y: [0, cellSize * 0.18, 0] }}
            transition={{ duration: 1.0, repeat: Infinity, ease: 'easeInOut' }}
            style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg
              viewBox="0 0 80 100"
              width={w * 0.9}
              height={h * 0.7}
              fill={theme.buttonRotateBg}
              stroke={theme.buttonRotateBorder}
              strokeWidth={3.5}
              strokeLinejoin="round"
              style={{
                filter: `drop-shadow(0 0 ${cellSize * 0.18}px ${theme.buttonRotateBorder})`,
                opacity: 0.92,
              }}
              aria-hidden
            >
              {/* Stylised down-arrow: a wide head + a stubby shaft.
                  Drawn rather than emoji so it scales crisply at any
                  cell size and inherits the theme's accent colour. */}
              <path d="M30 6 L50 6 L50 48 L70 48 L40 88 L10 48 L30 48 Z" />
            </svg>
            <span
              className="mt-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold whitespace-nowrap"
              style={{
                background: theme.buttonRotateBg,
                border: `1px solid ${theme.buttonRotateBorder}`,
                color: theme.buttonRotateText,
                opacity: 0.95,
                fontSize: Math.max(10, cellSize * 0.28),
              }}
            >
              {t('hint.rotateBelow')}
            </span>
          </motion.div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
