'use client';
import { motion } from 'framer-motion';
import { GameState, Orientation } from '@/game/types';
import { PIECE_EMOJI, squareLabel } from '@/game/constants';
import { useSettings } from '@/hooks/useSettings';
import { format } from '@/game/locales';

interface Props {
  state: GameState;
  onMainMenu: () => void;
  onRestartMatch: () => void;
  onRotateTo: (orientation: Orientation) => void;
  onEndTurn: () => void;
  onSwitchToShieldedPiece: () => void;
  onSwitchToShieldingButterfly: () => void;
}

const ALL_TYPES = ['monkey', 'bat', 'butterfly', 'ant', 'elephant', 'lion'] as const;

export default function GameHUD({ state, onMainMenu, onRestartMatch, onRotateTo, onEndTurn, onSwitchToShieldedPiece, onSwitchToShieldingButterfly }: Props) {
  const { theme, t } = useSettings();
  const { pieces, currentPlayer, selectedPieceId, validRotations, antHasRotated, antMovedThisTurn, lastAction, turn } = state;
  const pieceName = (type: string) => t(`piece.${type}`);

  const selectedPiece = selectedPieceId ? pieces.find(p => p.id === selectedPieceId) : null;
  const isAntSelected = selectedPiece?.type === 'ant';
  const isButterflyShielding = selectedPiece?.type === 'butterfly' && selectedPiece.shielding;
  const shieldedPiece = isButterflyShielding ? pieces.find(p => p.id === selectedPiece!.shielding) : null;
  const isShieldedSelected = !!selectedPiece?.shieldedBy;
  const guardianButterfly = isShieldedSelected ? pieces.find(p => p.id === selectedPiece!.shieldedBy) : null;
  const showEndTurn = isAntSelected && (antHasRotated || antMovedThisTurn); // Show if rotated or moved
  const elephantCooldown = selectedPiece?.type === 'elephant' ? (selectedPiece.cooldown ?? 0) : 0;

  const p1Pieces = pieces.filter(p => p.player === 1);
  const p2Pieces = pieces.filter(p => p.player === 2);

  // Fluid scale tokens — typography, spacing, widths all scale with viewport
  // width via clamp(). Tuned so the panel reads cleanly on a phone (~360px)
  // through a 4K monitor without ever feeling chunky. Caps were dialed back
  // after the previous version felt oversized on desktop.
  const fs = {
    small:  'clamp(11px, 0.6rem + 0.2vw, 13px)',
    base:   'clamp(12px, 0.65rem + 0.25vw, 15px)',
    medium: 'clamp(13px, 0.7rem + 0.3vw, 17px)',
    large:  'clamp(15px, 0.8rem + 0.4vw, 20px)',
    huge:   'clamp(20px, 1rem + 0.5vw, 26px)',
    icon:   'clamp(18px, 0.9rem + 0.4vw, 24px)',
  };
  const sp = {
    gap:    'clamp(6px, 0.3rem + 0.2vw, 12px)',
    padBig: 'clamp(10px, 0.5rem + 0.25vw, 16px)',
    padMed: 'clamp(7px, 0.4rem + 0.15vw, 12px)',
    radius: 'clamp(8px, 0.45rem + 0.15vw, 14px)',
  };

  return (
    <div
      className="zi-hud flex flex-col w-full max-w-md mx-auto lg:mx-0 lg:max-w-none min-w-0 shrink-0 pb-safe"
      style={{
        color: theme.textPrimary,
        fontSize: fs.base,
        gap: sp.gap,
      }}
    >

      {/* Turn indicator */}
      <motion.div
        key={currentPlayer}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center font-bold"
        style={{
          background: currentPlayer === 1 ? theme.p1AccentBg : theme.p2AccentBg,
          border: `1px solid ${currentPlayer === 1 ? theme.p1AccentBorder : theme.p2AccentBorder}`,
          padding: sp.padBig,
          borderRadius: sp.radius,
          fontSize: fs.large,
        }}
      >
        <div style={{ color: currentPlayer === 1 ? theme.p1Color : theme.p2Color }}>
          {currentPlayer === 1 ? '🥇' : '🥈'} {format(t('hud.playerTurn'), { n: currentPlayer })}
        </div>
        <div className="opacity-70 mt-1 font-normal" style={{ fontSize: fs.small }}>{format(t('hud.turnCounter'), { n: turn })}</div>
      </motion.div>

      {/* Last action */}
      <div className="opacity-85 text-center"
        style={{
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
          padding: sp.padMed,
          borderRadius: sp.radius,
          fontSize: fs.base,
        }}>
        {(() => {
          if (!lastAction || !lastAction.key) return '';
          const vars: Record<string, string | number> = {};
          for (const [k, v] of Object.entries(lastAction.vars ?? {})) {
            vars[k] = (typeof v === 'string' && k.toLowerCase().endsWith('name')) ? t(`piece.${v}`) : v;
          }
          return format(t(lastAction.key), vars);
        })()}
      </div>

      {/* Selected piece info + controls. Fade-only (no scale/translate) so
          the surrounding HUD doesn't visibly shift when this panel appears. */}
      {selectedPiece && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          style={{
            background: theme.panelBg,
            border: `1px solid ${theme.panelBorder}`,
            padding: sp.padBig,
            borderRadius: sp.radius,
          }}
        >
          <div className="font-semibold mb-2 opacity-85" style={{ fontSize: fs.medium }}>{t('hud.selected')}</div>
          <div className="flex items-center gap-3 mb-3">
            <span style={{ fontSize: fs.huge }}>{PIECE_EMOJI[selectedPiece.type]}</span>
            <div>
              <div className="font-bold" style={{ fontSize: fs.medium }}>{pieceName(selectedPiece.type)}</div>
              <div className="opacity-70" style={{ fontSize: fs.small }}>
                {format(t('hud.position'), {
                  n: selectedPiece.player,
                  sq: squareLabel(selectedPiece.row, selectedPiece.col),
                })}
              </div>
            </div>
          </div>

          {selectedPiece.isDamaged && (
            <div className="text-red-400 mb-1" style={{ fontSize: fs.base }}>{t('hud.brokenHeart')}</div>
          )}
          {selectedPiece.isParalyzed && (
            <div className="text-purple-400 mb-1" style={{ fontSize: fs.base }}>{t('hud.paralyzed')}</div>
          )}
          {selectedPiece.shieldedBy && (
            <div className="text-blue-400 mb-1" style={{ fontSize: fs.base }}>{t('hud.shieldedBy')}</div>
          )}
          {elephantCooldown > 0 && (
            <div className="opacity-80 mb-1" style={{ fontSize: fs.base }}>{t('hud.cooldown')}</div>
          )}
          {selectedPiece.orientation && (
            <div className="opacity-60 mb-1" style={{ fontSize: fs.small }}>
              {format(t('hud.orientation'), { o: t(`orientation.${selectedPiece.orientation}`) })}
            </div>
          )}

          {/* Shielded ally selected: offer to swap selection to the butterfly so it moves alone. */}
          {isShieldedSelected && guardianButterfly && (
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={onSwitchToShieldingButterfly}
              className="font-semibold mt-2 w-full text-left"
              style={{
                background: theme.buttonSwitchBg,
                border: `1px solid ${theme.buttonSwitchBorder}`,
                color: theme.buttonSwitchText,
                padding: sp.padMed,
                borderRadius: sp.radius,
                fontSize: fs.base,
              }}
            >
              {format(t('hud.moveButterflyAlone'), { name: pieceName(selectedPiece.type) })}
            </motion.button>
          )}

          {/* Butterfly is selected and shielding someone: offer to swap to the shielded piece. */}
          {isButterflyShielding && shieldedPiece && (
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={onSwitchToShieldedPiece}
              className="font-semibold mt-2 w-full text-left"
              style={{
                background: theme.buttonSwitchBg,
                border: `1px solid ${theme.buttonSwitchBorder}`,
                color: theme.buttonSwitchText,
                padding: sp.padMed,
                borderRadius: sp.radius,
                fontSize: fs.base,
              }}
            >
              {format(t('hud.moveShielded'), { name: pieceName(shieldedPiece.type) })}
            </motion.button>
          )}

          {/* Ant: rotation options (only valid) and End Turn */}
          {isAntSelected && (
            <div className="flex flex-col mt-2" style={{ gap: sp.gap }}>
              <div className="opacity-80 mb-1" style={{ fontSize: fs.base }}>{t('hud.rotateTo')}</div>
              <div className="flex flex-wrap" style={{ gap: 'clamp(4px, 0.3rem + 0.1vw, 8px)' }}>
                {(validRotations ?? []).map(ori => (
                  <motion.button
                    key={ori}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => onRotateTo(ori)}
                    className="font-semibold"
                    style={{
                      background: theme.buttonRotateBg,
                      border: `1px solid ${theme.buttonRotateBorder}`,
                      color: theme.buttonRotateText,
                      padding: 'clamp(4px, 0.3rem + 0.1vw, 8px) clamp(8px, 0.5rem + 0.2vw, 14px)',
                      borderRadius: 'clamp(6px, 0.4rem + 0.1vw, 10px)',
                      fontSize: fs.small,
                    }}
                  >
                    {t(`orientation.${ori}`)}
                  </motion.button>
                ))}
                {(validRotations ?? []).length === 0 && (
                  <span className="opacity-60" style={{ fontSize: fs.small }}>{t('hud.noValidRotation')}</span>
                )}
              </div>

              {showEndTurn && (
                <motion.button
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={onEndTurn}
                  className="font-semibold mt-1"
                  style={{
                    background: theme.buttonEndTurnBg,
                    border: `1px solid ${theme.buttonEndTurnBorder}`,
                    color: theme.buttonEndTurnText,
                    padding: sp.padMed,
                    borderRadius: sp.radius,
                    fontSize: fs.base,
                  }}
                >
                  {t('hud.endTurn')}
                </motion.button>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Piece count per player */}
      {[1, 2].map(player => {
        const playerPieces = player === 1 ? p1Pieces : p2Pieces;
        const color = player === 1 ? theme.p1Color : theme.p2Color;
        const bcolor = player === 1
          ? `color-mix(in srgb, ${theme.p1Color} 15%, transparent)`
          : `color-mix(in srgb, ${theme.p2Color} 15%, transparent)`;
        const border = player === 1
          ? `1px solid color-mix(in srgb, ${theme.p1Color} 30%, transparent)`
          : `1px solid color-mix(in srgb, ${theme.p2Color} 30%, transparent)`;
        return (
          <div key={player} style={{ background: bcolor, border, padding: sp.padMed, borderRadius: sp.radius }}>
            <div className="font-semibold mb-2" style={{ color, fontSize: fs.base }}>
              {format(t(`hud.player${player}Pieces`), { n: playerPieces.length })}
            </div>
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              {ALL_TYPES.map(type => {
                const count = playerPieces.filter(p => p.type === type).length;
                if (count === 0) return null;
                return (
                  <div key={type} className="flex items-center gap-1 opacity-90" style={{ fontSize: fs.small }}>
                    <span style={{ fontSize: fs.icon }}>{PIECE_EMOJI[type]}</span>
                    <span>×{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Life cycle legend */}
      <div style={{
        background: theme.panelBg,
        border: `1px solid ${theme.panelBorder}`,
        padding: sp.padMed,
        borderRadius: sp.radius,
        fontSize: fs.base,
      }}>
        <div className="font-semibold mb-2 opacity-80">{t('hud.killCycle')}</div>
        <div className="flex flex-wrap gap-1 items-center opacity-75" style={{ fontSize: fs.medium }}>
          {['🐒', '🦇', '🦋', '🐜', '🐘', '🦁'].map((e, i, arr) => (
            <span key={i}>{e}{i < arr.length - 1 ? '→' : ''}</span>
          ))}
          <span className="ms-1 opacity-65" style={{ fontSize: fs.small }}>{t('hud.killCycleAll')}</span>
        </div>
        <div className="mt-1 opacity-65" style={{ fontSize: fs.small }}>{t('hud.killCycleNote')}</div>
      </div>

      {/* Main Menu — go back to start screen with the rules. */}
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={onMainMenu}
        className="font-semibold transition-opacity"
        style={{
          background: theme.buttonRotateBg,
          border: `1px solid ${theme.buttonRotateBorder}`,
          color: theme.buttonRotateText,
          padding: 'clamp(8px, 0.5rem + 0.2vw, 14px)',
          borderRadius: sp.radius,
          fontSize: fs.medium,
        }}
      >
        {t('hud.mainMenu')}
      </motion.button>

      {/* Restart match — fresh pieces, stay on the game board. */}
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={onRestartMatch}
        className="font-semibold opacity-75 hover:opacity-100 transition-opacity"
        style={{
          background: theme.buttonBg,
          border: `1px solid ${theme.buttonBorder}`,
          color: theme.textPrimary,
          padding: 'clamp(8px, 0.5rem + 0.2vw, 14px)',
          borderRadius: sp.radius,
          fontSize: fs.medium,
        }}
      >
        {t('hud.restartMatch')}
      </motion.button>
    </div>
  );
}
