'use client';
import { useEffect, useState } from 'react';
import { BOARD_SIZE, isThrone, isBarrier } from '@/game/constants';
import type { PuzzleSnapshotV1 } from '@/game/puzzleTypes';
import type { GamePiece, PieceType, Player, Orientation } from '@/game/types';

// Visual click-to-place editor for a PuzzleSnapshot. Replaces the
// JSON-paste textarea in PuzzleEditor so curators can author a
// position by clicking the board instead of editing raw JSON.
//
// Tools:
//   - Place tool: pick a piece type + player from the palette, click
//     a cell to drop it. Click an occupied cell to overwrite.
//   - Erase tool: click a cell to remove its piece.
//   - Rotate-ant tool: click an ant to cycle through its orientations
//     (horizontal → vertical → diagonal → antidiagonal → horizontal).
//
// Side-to-move toggle and a "load default starting position" button
// live above the board. The JSON output is exposed via a
// collapsible "raw JSON" panel so power users can still copy/paste
// or audit values, but the visual flow is the default.

interface Props {
  value: PuzzleSnapshotV1;
  onChange: (next: PuzzleSnapshotV1) => void;
}

type Tool =
  | { kind: 'place'; pieceType: PieceType; player: Player }
  | { kind: 'erase' }
  | { kind: 'rotate' };

const PIECE_TYPES: PieceType[] = ['lion', 'elephant', 'monkey', 'bat', 'butterfly', 'ant'];

const EMOJI: Record<PieceType, string> = {
  lion: '🦁',
  elephant: '🐘',
  monkey: '🐒',
  bat: '🦇',
  butterfly: '🦋',
  ant: '🐜',
};

const ORIENTATION_CYCLE: Orientation[] = ['horizontal', 'vertical', 'diagonal', 'antidiagonal'];

const ORIENTATION_TICK: Record<Orientation, string> = {
  horizontal:    '↔',
  vertical:      '↕',
  diagonal:      '↗',
  antidiagonal:  '↘',
};

function pieceDefaults(type: PieceType): Pick<GamePiece, 'hp' | 'isDamaged' | 'isParalyzed' | 'orientation'> {
  return {
    hp: type === 'elephant' ? 2 : 1,
    isDamaged: false,
    isParalyzed: false,
    orientation: type === 'ant' ? 'horizontal' : undefined,
  };
}

function makeId(type: PieceType, player: Player): string {
  // Unique-enough id; the engine treats id as opaque and the
  // validator regenerates ids when serialising the proof tree.
  return `${type}_p${player}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** The standard 18-vs-18 starting layout, mirrored along the centre.
 *  Same composition the live game ships with — see
 *  src/game/initialState.ts for the canonical version, recreated here
 *  so the editor doesn't pull in the full state hydrator. */
function defaultStartPieces(): GamePiece[] {
  type Spec = { type: PieceType; player: Player; row: number; col: number };
  const specs: Spec[] = [];
  // Player 1: bottom three rows (13/14/15).
  // Row 15: lion at c1, elephant at c14
  specs.push({ type: 'lion',     player: 1, row: 15, col: 1  });
  specs.push({ type: 'elephant', player: 1, row: 15, col: 14 });
  // Row 14: distribution by piece type
  const back14: Array<[PieceType, number]> = [
    ['monkey', 0], ['bat', 2], ['butterfly', 4], ['butterfly', 6],
    ['monkey', 9], ['bat', 11], ['ant', 13],
  ];
  back14.forEach(([t, c]) => specs.push({ type: t, player: 1, row: 14, col: c }));
  // Row 13: another mix
  const front13: Array<[PieceType, number]> = [
    ['ant', 1], ['ant', 4], ['ant', 7], ['ant', 10], ['ant', 13],
  ];
  front13.forEach(([t, c]) => specs.push({ type: t, player: 1, row: 13, col: c }));

  // Mirror to player 2 (top three rows: 0/1/2).
  for (const s of [...specs]) {
    specs.push({ type: s.type, player: 2, row: BOARD_SIZE - 1 - s.row, col: BOARD_SIZE - 1 - s.col });
  }

  return specs.map(s => ({
    id: makeId(s.type, s.player),
    type: s.type,
    player: s.player,
    row: s.row,
    col: s.col,
    ...pieceDefaults(s.type),
  }));
}

export default function PositionEditor({ value, onChange }: Props) {
  const [tool, setTool] = useState<Tool>({ kind: 'place', pieceType: 'lion', player: 1 });
  const [showJson, setShowJson] = useState(false);
  const [cellSize, setCellSize] = useState(28);

  // Responsive cell sizing — board fits within the modal/page width.
  useEffect(() => {
    function calc() {
      const vw = window.innerWidth;
      const padding = vw < 640 ? 32 : 48;
      // Side panel reserves ~280 px on lg+, so keep the board square
      // and pin to the smaller of width / height budget.
      const sidePanelReserve = vw >= 1024 ? 320 : 0;
      const widthBudget = vw - padding - sidePanelReserve;
      const fromWidth = Math.floor(widthBudget / 16.5);
      const minCell = vw < 360 ? 16 : 18;
      const maxCell = 36;
      setCellSize(Math.max(minCell, Math.min(maxCell, fromWidth)));
    }
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  const pieces = value.pieces;

  function handleCellClick(row: number, col: number) {
    const at = pieces.find(p => p.row === row && p.col === col);
    if (tool.kind === 'erase') {
      if (!at) return;
      onChange({ ...value, pieces: pieces.filter(p => p.id !== at.id) });
      return;
    }
    if (tool.kind === 'rotate') {
      if (!at || at.type !== 'ant') return;
      const cur = at.orientation ?? 'horizontal';
      const next = ORIENTATION_CYCLE[(ORIENTATION_CYCLE.indexOf(cur) + 1) % ORIENTATION_CYCLE.length];
      onChange({
        ...value,
        pieces: pieces.map(p => p.id === at.id ? { ...p, orientation: next } : p),
      });
      return;
    }
    // Place: drop a fresh piece, replacing whatever was on the cell.
    const others = at ? pieces.filter(p => p.id !== at.id) : pieces;
    const placed: GamePiece = {
      id: makeId(tool.pieceType, tool.player),
      type: tool.pieceType,
      player: tool.player,
      row,
      col,
      ...pieceDefaults(tool.pieceType),
    };
    onChange({ ...value, pieces: [...others, placed] });
  }

  function setSide(side: Player) {
    onChange({ ...value, sideToMove: side });
  }

  function clearAll() {
    if (!confirm('Clear every piece on the board?')) return;
    onChange({ ...value, pieces: [] });
  }

  function loadDefaults() {
    if (pieces.length > 0 && !confirm('Replace the current position with the default starting layout?')) return;
    onChange({ ...value, pieces: defaultStartPieces() });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Side-to-move + bulk actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Side to move:</span>
        <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #d1d5db' }}>
          <button
            type="button"
            onClick={() => setSide(1)}
            style={sideBtn(value.sideToMove === 1, '#fcd34d')}
          >
            🦁 Player 1
          </button>
          <button
            type="button"
            onClick={() => setSide(2)}
            style={sideBtn(value.sideToMove === 2, '#a78bfa')}
          >
            🦁 Player 2
          </button>
        </div>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={loadDefaults} style={btnGhost}>Default layout</button>
        <button type="button" onClick={clearAll} style={btnDanger}>Clear all</button>
      </div>

      {/* Palette: piece type × player + tools */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 8,
          padding: 10, borderRadius: 8, background: '#f9fafb',
          border: '1px solid #e5e7eb',
        }}
      >
        {([1, 2] as Player[]).map(player => (
          <div key={player} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#6b7280', marginRight: 4 }}>P{player}</span>
            {PIECE_TYPES.map(pt => {
              const active = tool.kind === 'place' && tool.pieceType === pt && tool.player === player;
              return (
                <button
                  key={pt}
                  type="button"
                  onClick={() => setTool({ kind: 'place', pieceType: pt, player })}
                  title={`${pt} (player ${player})`}
                  style={paletteBtn(active, player === 1 ? '#fcd34d' : '#a78bfa')}
                >
                  {EMOJI[pt]}
                </button>
              );
            })}
          </div>
        ))}
        <span style={{ width: 1, alignSelf: 'stretch', background: '#d1d5db', margin: '0 4px' }} />
        <button
          type="button"
          onClick={() => setTool({ kind: 'rotate' })}
          title="Click an ant to cycle its orientation"
          style={paletteBtn(tool.kind === 'rotate', '#10b981')}
        >
          ↻
        </button>
        <button
          type="button"
          onClick={() => setTool({ kind: 'erase' })}
          title="Click a piece to remove it"
          style={paletteBtn(tool.kind === 'erase', '#ef4444')}
        >
          🧹
        </button>
      </div>

      {/* Board */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${BOARD_SIZE}, ${cellSize}px)`,
            gap: 0,
            border: '2px solid #d4a017',
            borderRadius: 6,
            overflow: 'hidden',
            background: 'rgba(8,10,30,0.85)',
            userSelect: 'none',
            touchAction: 'manipulation',
          }}
        >
          {Array.from({ length: BOARD_SIZE }).map((_, row) =>
            Array.from({ length: BOARD_SIZE }).map((_, col) => {
              const piece = pieces.find(p => p.row === row && p.col === col);
              const throne = isThrone(row, col);
              const barrier = isBarrier(row, col);
              const isEven = (row + col) % 2 === 0;
              let bg = isEven ? '#3b3f8a' : '#11142e';
              if (throne) bg = '#d4a017';
              if (barrier) bg = '#1a3a45';
              const tint = piece
                ? piece.player === 1 ? 'rgba(252,211,77,0.35)' : 'rgba(167,139,250,0.4)'
                : null;
              const orientationGlyph = piece && piece.type === 'ant'
                ? ORIENTATION_TICK[piece.orientation ?? 'horizontal']
                : '';
              const cursor = tool.kind === 'erase' && piece ? 'crosshair'
                : tool.kind === 'rotate' && piece?.type === 'ant' ? 'grab'
                : 'pointer';
              return (
                <div
                  key={`${row}-${col}`}
                  onClick={() => handleCellClick(row, col)}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    background: tint
                      ? `linear-gradient(${tint}, ${tint}), ${bg}`
                      : bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: cellSize * 0.55,
                    cursor,
                    position: 'relative',
                    boxShadow: piece
                      ? `inset 0 0 0 1px ${piece.player === 1 ? 'rgba(252,211,77,0.6)' : 'rgba(167,139,250,0.6)'}`
                      : undefined,
                  }}
                >
                  {piece ? EMOJI[piece.type] : ''}
                  {orientationGlyph && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 1,
                        fontSize: cellSize * 0.32,
                        lineHeight: 1,
                        color: piece?.player === 1 ? '#fde68a' : '#ddd6fe',
                        fontWeight: 700,
                      }}
                    >
                      {orientationGlyph}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right panel: stats + JSON dump */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, minWidth: 220, flex: 1 }}>
          <div style={{ padding: 10, borderRadius: 6, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
            <div><strong>Pieces:</strong> {pieces.length}</div>
            <div>
              <strong>P1:</strong> {pieces.filter(p => p.player === 1).length}
              {' · '}
              <strong>P2:</strong> {pieces.filter(p => p.player === 2).length}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
              Throne is the gold 2×2 centre. Barriers are the dusky cells just below/above it.
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              Ants show their orientation in the corner; pick the ↻ tool and click the ant to cycle.
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowJson(s => !s)}
            style={{ ...btnGhost, alignSelf: 'flex-start' }}
          >
            {showJson ? 'Hide raw JSON' : 'Show raw JSON'}
          </button>
          {showJson && (
            <textarea
              readOnly
              value={JSON.stringify(value, null, 2)}
              rows={10}
              style={{
                width: '100%',
                fontFamily: 'monospace',
                fontSize: 11,
                padding: 8,
                border: '1px solid #d1d5db',
                borderRadius: 4,
              }}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── Inline button styles ───────────────────────────────────────────────

const btnGhost: React.CSSProperties = {
  padding: '6px 12px',
  background: 'white',
  color: '#1f2937',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
};

const btnDanger: React.CSSProperties = {
  padding: '6px 12px',
  background: 'white',
  color: '#b91c1c',
  border: '1px solid #fca5a5',
  borderRadius: 6,
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
};

function sideBtn(active: boolean, accent: string): React.CSSProperties {
  return {
    padding: '6px 12px',
    background: active ? accent : 'white',
    color: active ? '#1f2937' : '#374151',
    border: 'none',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
  };
}

function paletteBtn(active: boolean, accent: string): React.CSSProperties {
  return {
    width: 36,
    height: 36,
    background: active ? accent : 'white',
    border: `1px solid ${active ? accent : '#d1d5db'}`,
    borderRadius: 6,
    fontSize: 18,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: active ? `0 0 0 2px ${accent}55` : undefined,
  };
}
