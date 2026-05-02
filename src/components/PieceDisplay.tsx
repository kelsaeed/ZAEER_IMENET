'use client';
import { motion } from 'framer-motion';
import { GamePiece, BounceEffect } from '@/game/types';
import { PIECE_EMOJI, PIECE_NAME } from '@/game/constants';
import { useSettings } from '@/hooks/useSettings';

interface Props {
  piece: GamePiece;
  isCenter: boolean;
  isSelected: boolean;
  size: number;
  overlay?: GamePiece;
  bounceEffect?: BounceEffect;
}

export default function PieceDisplay({ piece, isCenter, isSelected, size, overlay, bounceEffect }: Props) {
  const { theme } = useSettings();
  const isP1 = piece.player === 1;
  const hasBounce = bounceEffect?.pieceId === piece.id;
  const onCooldown = piece.type === 'elephant' && (piece.cooldown ?? 0) > 0;

  // Bounce animation: piece lunges toward target then settles at current (adjacent) position
  const bounceX = hasBounce ? bounceEffect!.dc * size * 0.9 : 0;
  const bounceY = hasBounce ? bounceEffect!.dr * size * 0.9 : 0;

  // Strong, opaque player color domination — the piece's primary color is what
  // identifies the owner. We mix the theme's player color with the cell behind
  // it at high strength so it never washes out into the board.
  const ownerColor = isP1 ? theme.p1Color : theme.p2Color;
  const ownerBg = isSelected
    ? `radial-gradient(circle at 30% 30%, color-mix(in srgb, white 25%, ${ownerColor}) 0%, ${ownerColor} 65%)`
    : `radial-gradient(circle at 30% 30%, color-mix(in srgb, white 18%, ${ownerColor}) 0%, color-mix(in srgb, ${ownerColor} 75%, transparent) 80%)`;

  // Player 1 = solid raised look. Player 2 = inset/recessed look with a
  // dashed border accent. Even at the same hue strength a player can tell
  // them apart by these treatments.
  const ownerBorder = isSelected
    ? `2px solid ${theme.selectedRing}`
    : isP1
      ? `2px solid ${theme.p1Border}`
      : `2px dashed ${theme.p2Border}`;

  const ownerShadow = isSelected
    ? (isP1 ? theme.p1Glow : theme.p2Glow)
    : piece.isParalyzed ? '0 0 8px 2px rgba(168,85,247,0.6)'
    : onCooldown ? '0 0 0 2px rgba(160,160,160,0.55) inset, 0 0 6px rgba(0,0,0,0.4)'
    : isP1
      ? '0 2px 6px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08) inset'  // raised
      : '0 0 0 1px rgba(0,0,0,0.55) inset, 0 0 6px rgba(0,0,0,0.3) inset';     // recessed

  const baseStyle: React.CSSProperties = {
    width: size - 4,
    height: size - 4,
    borderRadius: piece.type === 'ant' ? (isCenter ? '8px' : '4px') : '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    fontSize: isCenter ? Math.floor(size * 0.38) : Math.floor(size * 0.22),
    cursor: 'pointer',
    userSelect: 'none',
    border: ownerBorder,
    background: ownerBg,
    boxShadow: ownerShadow,
    opacity: piece.isParalyzed ? 0.7 : onCooldown ? 0.85 : 1,
  };

  if (piece.type === 'ant' && !isCenter) {
    return (
      <motion.div
        style={{ ...baseStyle, opacity: 0.6, fontSize: Math.floor(size * 0.18) }}
        animate={hasBounce ? {
          x: [0, bounceX, 0],
          y: [0, bounceY, 0],
        } : { x: 0, y: 0 }}
        transition={hasBounce ? { duration: 0.45, ease: 'easeInOut' } : {}}
      >
        <span style={{ opacity: 0.7 }}>━</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      style={baseStyle}
      animate={
        hasBounce
          ? { x: [0, bounceX, 0], y: [0, bounceY, 0], scale: 1 }
          : isSelected
          ? { scale: [1, 1.08, 1] }
          : { scale: 1, x: 0, y: 0 }
      }
      transition={
        hasBounce
          ? { duration: 0.45, ease: 'easeInOut' }
          : { duration: 0.8, repeat: isSelected ? Infinity : 0 }
      }
    >
      <span style={{ lineHeight: 1, filter: piece.isParalyzed ? 'grayscale(0.6)' : 'none' }}>
        {PIECE_EMOJI[piece.type]}
      </span>

      {/* Player marker — shape differs per player so colorblind users can also
          tell sides apart at a glance: P1 = filled circle, P2 = diamond. */}
      <span style={{
        position: 'absolute', bottom: 1, right: 1,
        width: Math.max(7, size * 0.18), height: Math.max(7, size * 0.18),
        borderRadius: isP1 ? '50%' : '2px',
        background: isP1 ? theme.p1Color : theme.p2Color,
        border: '1.5px solid rgba(0,0,0,0.65)',
        transform: isP1 ? undefined : 'rotate(45deg)',
        boxShadow: isP1 ? '0 0 4px rgba(0,0,0,0.4)' : '0 0 3px rgba(0,0,0,0.5)',
      }} />

      {/* Broken heart (elephant 1 HP) */}
      {piece.isDamaged && piece.type === 'elephant' && (
        <span style={{ position: 'absolute', top: -2, right: -2, fontSize: Math.floor(size * 0.3), lineHeight: 1 }}>
          💔
        </span>
      )}

      {/* Elephant attack cooldown indicator */}
      {piece.type === 'elephant' && (piece.cooldown ?? 0) > 0 && (
        <span
          style={{
            position: 'absolute', bottom: -4, left: -2,
            fontSize: Math.floor(size * 0.3), lineHeight: 1,
            filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.7))',
          }}
          title="Elephant on attack cooldown"
        >
          ⏳
        </span>
      )}

      {/* Paralyzed indicator */}
      {piece.isParalyzed && (
        <span style={{ position: 'absolute', top: -4, left: -2, fontSize: Math.floor(size * 0.28), lineHeight: 1 }}>
          💜
        </span>
      )}

      {/* Overlay piece (butterfly shield or bat on top) */}
      {overlay && (
        <motion.span
          style={{
            position: 'absolute', top: -6, left: -2,
            fontSize: Math.floor(size * 0.32), lineHeight: 1,
            filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.8))',
          }}
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {PIECE_EMOJI[overlay.type]}
        </motion.span>
      )}
    </motion.div>
  );
}
