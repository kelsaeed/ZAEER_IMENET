'use client';
import { GamePiece, BounceEffect } from '@/game/types';
import { PIECE_EMOJI } from '@/game/constants';
import { useSettings } from '@/hooks/useSettings';
import { usePlayerThemes } from '@/hooks/usePlayerThemes';

// This component used to wrap every piece in a framer-motion <motion.div>.
// With ~24 pieces on a board (plus overlay + ant-wing motion nodes), and the
// board re-rendering all 256 cells on every selection, that was the dominant
// board-interaction cost — each motion node subscribes to framer's animation
// loop and is re-diffed on every render. The three animations are now pure
// CSS keyframes (see globals.css: zi-piece-pulse / zi-piece-bounce /
// zi-overlay-wiggle), so idle pieces are plain divs and the GPU drives the
// motion. The look is unchanged; CSS animations also never restart on a React
// re-render (the old framer inline-object targets used to, which is the
// flicker the module-constant workaround below the imports was fighting).

interface Props {
  piece: GamePiece;
  isCenter: boolean;
  isSelected: boolean;
  size: number;
  overlay?: GamePiece;
  bounceEffect?: BounceEffect;
}

export default function PieceDisplay({ piece, isCenter, isSelected, size, overlay, bounceEffect }: Props) {
  // The viewer theme stays the source of the selection ring + paralysis
  // / cooldown indicators (those are universal cues the local user
  // reads, not skin-specific). The piece's OWNER theme drives every
  // colour that says "this piece is mine" — primary fill, border,
  // glow — so a custom theme acts as a piece skin.
  const { theme: viewerTheme } = useSettings();
  const playerThemes = usePlayerThemes();
  const ownerTheme = piece.player === 1 ? playerThemes.p1 : playerThemes.p2;
  const isP1 = piece.player === 1;
  const hasBounce = bounceEffect?.pieceId === piece.id;
  const onCooldown = piece.type === 'elephant' && (piece.cooldown ?? 0) > 0;

  // Bounce animation: piece lunges toward target then settles at current
  // (adjacent) position. The vector is passed to the CSS keyframe via custom
  // properties so the same .zi-piece-bounce class works for every direction.
  const bounceX = hasBounce ? bounceEffect!.dc * size * 0.9 : 0;
  const bounceY = hasBounce ? bounceEffect!.dr * size * 0.9 : 0;

  // Strong, opaque player color domination — the piece's primary color is what
  // identifies the owner. We mix the OWNER's theme's player color with the
  // cell behind it at high strength so it never washes out into the board,
  // and so each player's pieces wear their own skin regardless of viewer.
  const ownerColor = isP1 ? ownerTheme.p1Color : ownerTheme.p2Color;
  const ownerBg = isSelected
    ? `radial-gradient(circle at 30% 30%, color-mix(in srgb, white 25%, ${ownerColor}) 0%, ${ownerColor} 65%)`
    : `radial-gradient(circle at 30% 30%, color-mix(in srgb, white 18%, ${ownerColor}) 0%, color-mix(in srgb, ${ownerColor} 75%, transparent) 80%)`;

  // Player 1 = solid raised look. Player 2 = inset/recessed look with a
  // dashed border accent. Even at the same hue strength a player can tell
  // them apart by these treatments.
  const ownerBorder = isSelected
    ? `2px solid ${viewerTheme.selectedRing}`
    : isP1
      ? `2px solid ${ownerTheme.p1Border}`
      : `2px dashed ${ownerTheme.p2Border}`;

  const ownerShadow = isSelected
    ? (isP1 ? ownerTheme.p1Glow : ownerTheme.p2Glow)
    : piece.isParalyzed ? '0 0 8px 2px rgba(168,85,247,0.6)'
    : onCooldown ? '0 0 0 2px rgba(160,160,160,0.55) inset, 0 0 6px rgba(0,0,0,0.4)'
    : isP1
      ? '0 2px 6px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08) inset'  // raised
      : '0 0 0 1px rgba(0,0,0,0.55) inset, 0 0 6px rgba(0,0,0,0.3) inset';     // recessed

  // Emoji size: bumped up considerably so pieces are recognisable on small
  // mobile cells. We also keep a small floor so the symbol stays legible
  // even at the minimum cell size.
  const emojiSize = isCenter
    ? Math.max(14, Math.floor(size * 0.6))
    : Math.max(10, Math.floor(size * 0.3));

  const baseStyle: React.CSSProperties = {
    width: size - 4,
    height: size - 4,
    borderRadius: piece.type === 'ant' ? (isCenter ? '8px' : '4px') : '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    fontSize: emojiSize,
    cursor: 'pointer',
    userSelect: 'none',
    border: ownerBorder,
    background: ownerBg,
    boxShadow: ownerShadow,
    opacity: piece.isParalyzed ? 0.7 : onCooldown ? 0.85 : 1,
  };

  // Hand the bounce vector to the CSS keyframe (only when bouncing).
  const bounceVars = hasBounce
    ? ({ ['--zi-bx' as string]: `${bounceX}px`, ['--zi-by' as string]: `${bounceY}px` } as React.CSSProperties)
    : null;

  if (piece.type === 'ant' && !isCenter) {
    return (
      <div
        className={hasBounce ? 'zi-piece-bounce' : undefined}
        style={{ ...baseStyle, ...bounceVars, opacity: 0.6, fontSize: Math.floor(size * 0.18) }}
      >
        <span style={{ opacity: 0.7 }}>━</span>
      </div>
    );
  }

  // Bounce takes precedence over the idle selected-pulse, mirroring the old
  // framer animate-prop precedence.
  const animClass = hasBounce ? 'zi-piece-bounce' : isSelected ? 'zi-piece-pulse' : undefined;

  return (
    <div className={animClass} style={{ ...baseStyle, ...bounceVars }}>
      <span style={{ lineHeight: 1, filter: piece.isParalyzed ? 'grayscale(0.6)' : 'none' }}>
        {PIECE_EMOJI[piece.type]}
      </span>

      {/* (Player marker dot was removed — on small mobile cells it covered
          part of the emoji and made pieces hard to read. Sides are still
          clearly distinguished by the player colour, raised vs recessed
          look, and solid-vs-dashed border on the piece itself.) */}

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
        <span
          className="zi-overlay-wiggle"
          style={{
            position: 'absolute', top: -6, left: -2,
            fontSize: Math.floor(size * 0.32), lineHeight: 1,
            filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.8))',
            display: 'inline-block',
          }}
        >
          {PIECE_EMOJI[overlay.type]}
        </span>
      )}
    </div>
  );
}
