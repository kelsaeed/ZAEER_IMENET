'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BOARD_SIZE, isThrone, isBarrier, ORIENTATION_LABEL } from '@/game/constants';
import { puzzleSnapshotToState, type PuzzleSnapshotV1, type PuzzleMove } from '@/game/puzzleTypes';
import { simulatePuzzleMove } from '@/game/puzzleValidator';
import { getValidMoves } from '@/game/logic';
import type { GameState, GamePiece, Orientation, Player, PieceType } from '@/game/types';

// Each defender piece moves by its own movement rules (getValidMoves
// enforces piece-specific geometry — elephants orthogonal only, lions
// up to N squares, ants their wing geometry, etc.). We just pick
// uniformly at random from the union of all (piece, target) candidates.
// For ants, a post-rotation is included as part of the random roll
// when one is available.
function pickRandomDefenderMove(state: GameState, defender: Player): PuzzleMove | null {
  const candidates: PuzzleMove[] = [];
  for (const piece of state.pieces) {
    if (piece.player !== defender) continue;
    if (piece.isParalyzed) continue;
    const { moves, validRotations } = getValidMoves(piece, state.pieces);
    for (const m of moves) {
      const base: PuzzleMove = { pieceId: piece.id, target: { row: m.row, col: m.col } };
      candidates.push(base);
      if (piece.type === 'ant' && validRotations.length > 0) {
        for (const r of validRotations) {
          candidates.push({ ...base, rotateTo: r });
        }
      }
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// simulatePuzzleMove doesn't validate move geometry — it executes
// whatever target you hand it via applyMove. So before reusing a
// cached defender reply, confirm the move is still legal in the
// current state (pieceId still alive on the right side, target still
// in this piece's legal set, ant rotation still valid). Without this
// guard a stale cached reply could teleport a piece to a square it
// can't legally reach.
function isStillLegal(state: GameState, move: PuzzleMove, side: Player): boolean {
  const piece = state.pieces.find(p => p.id === move.pieceId);
  if (!piece) return false;
  if (piece.player !== side) return false;
  if (piece.isParalyzed) return false;
  const { moves, validRotations } = getValidMoves(piece, state.pieces);
  const targetLegal = moves.some(m => m.row === move.target.row && m.col === move.target.col);
  if (!targetLegal) return false;
  if (move.rotateTo && !validRotations.includes(move.rotateTo)) return false;
  return true;
}

// Visual click-to-record editor for a puzzle's attacker line. Replaces
// the JSON textarea in PuzzleEditor so the curator records moves by
// clicking on the board instead of hand-writing PuzzleMove objects.
//
// The defender is played by the local AI (hard) just to give the
// curator a concrete board to react to. The puzzle's correctness
// depends on EVERY defender reply, not the one the AI happened to
// pick — that AND/OR proof is what /api/admin/puzzles/validate runs
// on submit. The AI here is purely for the authoring UX; weak picks
// during recording don't affect what gets validated.
//
// Supported turn shapes:
//   • Non-ant pieces: click → click → recorded.
//   • Ant: click → click target → optionally pick a post-rotation,
//     OR press "End turn" to commit without rotating.
//   • rotate-only / pre-rotate ant turns aren't yet exposed in the
//     UI — they can still be authored by editing the raw JSON line
//     panel below the board.

interface Props {
  /** The starting position the curator built in PositionEditor. */
  snapshot: PuzzleSnapshotV1;
  /** The recorded attacker line. Lifted so PuzzleEditor can submit
   *  it to /validate alongside the position. */
  value: PuzzleMove[];
  onChange: (next: PuzzleMove[]) => void;
}

const EMOJI: Record<PieceType, string> = {
  lion: '🦁', elephant: '🐘', monkey: '🐒', bat: '🦇', butterfly: '🦋', ant: '🐜',
};

export default function SolutionRecorder({ snapshot, value, onChange }: Props) {
  const attackerSide = snapshot.sideToMove;
  const defenderSide = (3 - attackerSide) as Player;

  // Cell sizing — narrower than the position editor so the recorder
  // fits next to its own side panel without overflowing.
  const [cellSize, setCellSize] = useState(26);
  useEffect(() => {
    function calc() {
      const vw = window.innerWidth;
      const padding = vw < 640 ? 32 : 48;
      const sideReserve = vw >= 1024 ? 320 : 0;
      const widthBudget = vw - padding - sideReserve;
      const fromWidth = Math.floor(widthBudget / 16.5);
      const minCell = vw < 360 ? 14 : 16;
      const maxCell = 30;
      setCellSize(Math.max(minCell, Math.min(maxCell, fromWidth)));
    }
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // Cache of random defender replies, indexed by attacker move position.
  // Without this, the defender would re-roll on every render — selecting
  // a piece, hovering, etc. would silently change the past defender
  // moves under the curator. With it, each attacker move triggers
  // exactly one fresh defender roll, which then sticks until the line
  // is changed below it. Tied to snapshot identity so authoring a
  // different puzzle starts with an empty cache.
  const defenderRollsRef = useRef<{ snapshot: PuzzleSnapshotV1; rolls: (PuzzleMove | null)[] }>({
    snapshot,
    rolls: [],
  });

  // Replay the recorded line on top of the snapshot, picking a random
  // defender response between attacker moves so the live board is
  // always at "attacker to move" or "puzzle resolved". Each defender
  // piece moves by its own movement rules; the picker just rolls
  // uniformly from the union of legal moves.
  const liveState = useMemo<GameState>(() => {
    if (defenderRollsRef.current.snapshot !== snapshot) {
      defenderRollsRef.current = { snapshot, rolls: [] };
    }
    const cache = defenderRollsRef.current.rolls;

    let s = puzzleSnapshotToState(snapshot);
    for (let i = 0; i < value.length; i++) {
      try { s = simulatePuzzleMove(s, value[i]); }
      catch { return s; }
      if (s.phase !== 'playing' || s.currentPlayer !== defenderSide) continue;

      // Reuse the cached roll only if it's still legal in this state.
      // simulatePuzzleMove does not validate geometry, so without this
      // check a stale cached reply (e.g. piece that has since moved
      // because the attacker line above was edited) could teleport
      // illegally. If invalid, drop it and roll fresh.
      let reply: PuzzleMove | null = cache[i] ?? null;
      if (reply && !isStillLegal(s, reply, defenderSide)) reply = null;
      if (!reply) {
        reply = pickRandomDefenderMove(s, defenderSide);
        cache[i] = reply;
      }
      if (!reply) continue;
      try { s = simulatePuzzleMove(s, reply); } catch { /* ignore */ }
    }
    // Trim cache when the attacker line shrank (undo / clear).
    if (cache.length > value.length) cache.length = value.length;
    return s;
  }, [snapshot, value, defenderSide]);

  const isAttackerTurn = liveState.phase === 'playing' && liveState.currentPlayer === attackerSide;
  const finished = liveState.phase === 'won';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [vmoves, setVmoves] = useState<{ row: number; col: number }[]>([]);
  const [vrots, setVrots] = useState<Orientation[]>([]);
  // When an ant moves, we hold the chosen target so the curator can
  // pick a post-rotation. null means "no pending move".
  const [antPending, setAntPending] = useState<{ row: number; col: number } | null>(null);

  // Reset selection any time the live state changes (recorded line
  // grew or shrunk → previous selection is meaningless).
  useEffect(() => {
    setSelectedId(null);
    setVmoves([]);
    setVrots([]);
    setAntPending(null);
  }, [value, snapshot]);

  function clearSelection() {
    setSelectedId(null);
    setVmoves([]);
    setVrots([]);
    setAntPending(null);
  }

  function selectPiece(piece: GamePiece) {
    if (!isAttackerTurn) return;
    if (piece.player !== attackerSide) return;
    const result = getValidMoves(piece, liveState.pieces);
    setSelectedId(piece.id);
    setVmoves(result.moves);
    setVrots(result.canRotate ? result.validRotations : []);
    setAntPending(null);
  }

  function commitMove(move: PuzzleMove) {
    onChange([...value, move]);
    // Selection clears via useEffect on `value` change.
  }

  function onCellClick(row: number, col: number) {
    if (!isAttackerTurn) return;

    const here = liveState.pieces.find(p => p.row === row && p.col === col);

    // No selection → try to select an attacker piece on this cell.
    if (!selectedId) {
      if (here && here.player === attackerSide) selectPiece(here);
      return;
    }

    // Click another of my pieces → swap selection.
    if (here && here.player === attackerSide && here.id !== selectedId) {
      selectPiece(here);
      return;
    }

    // Click a valid target.
    const target = vmoves.find(m => m.row === row && m.col === col);
    if (!target) {
      // Click on an empty / opponent cell that isn't a valid move → deselect.
      clearSelection();
      return;
    }

    // Valid move. For ants we offer post-rotation; otherwise commit
    // immediately.
    const sel = liveState.pieces.find(p => p.id === selectedId);
    if (sel && sel.type === 'ant' && vrots.length > 0) {
      setAntPending({ row, col });
    } else {
      commitMove({ pieceId: selectedId, target: { row, col } });
    }
  }

  function commitAntRotateTo(rotateTo: Orientation) {
    if (!antPending || !selectedId) return;
    commitMove({ pieceId: selectedId, target: antPending, rotateTo });
  }

  function commitAntNoRotate() {
    if (!antPending || !selectedId) return;
    commitMove({ pieceId: selectedId, target: antPending });
  }

  function undo() {
    if (value.length === 0) return;
    onChange(value.slice(0, -1));
  }
  function clearAll() {
    if (value.length === 0) return;
    if (!confirm('Discard all recorded attacker moves?')) return;
    onChange([]);
  }

  const labelOffset = cellSize * 0.5;
  // Helper to fetch the piece sitting on a cell from the LIVE state
  // (post-replay), not from the original snapshot.
  function pieceAt(row: number, col: number): GamePiece | undefined {
    return liveState.pieces.find(p => p.row === row && p.col === col);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Board */}
        <div
          style={{
            display: 'inline-block',
            border: '2px solid #d4a017',
            borderRadius: 6,
            overflow: 'hidden',
            background: 'rgba(8,10,30,0.85)',
            userSelect: 'none',
            touchAction: 'manipulation',
            width: cellSize * BOARD_SIZE + cellSize * 0.5,
          }}
        >
          {Array.from({ length: BOARD_SIZE }).map((_, row) => (
            <div key={row} style={{ display: 'flex' }}>
              {/* Row label column to mirror the player board */}
              <div
                style={{
                  width: cellSize * 0.5,
                  height: cellSize,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: Math.max(8, cellSize * 0.32),
                  color: 'rgba(245,247,255,0.45)',
                }}
              >
                {BOARD_SIZE - row}
              </div>
              {Array.from({ length: BOARD_SIZE }).map((_, col) => {
                const piece = pieceAt(row, col);
                const throne = isThrone(row, col);
                const barrier = isBarrier(row, col);
                const isEven = (row + col) % 2 === 0;
                let bg = isEven ? '#3b3f8a' : '#11142e';
                if (throne) bg = '#d4a017';
                if (barrier) bg = '#1a3a45';
                const isValidTarget = !!vmoves.find(m => m.row === row && m.col === col);
                const isSelected = !!piece && piece.id === selectedId;
                const tint = piece
                  ? piece.player === 1 ? 'rgba(252,211,77,0.35)' : 'rgba(167,139,250,0.4)'
                  : null;
                const cursor = isAttackerTurn
                  ? (piece?.player === attackerSide || isValidTarget ? 'pointer' : 'default')
                  : 'default';
                return (
                  <div
                    key={col}
                    onClick={() => onCellClick(row, col)}
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
                      boxShadow: isSelected
                        ? `inset 0 0 0 2px #facc15`
                        : piece
                          ? `inset 0 0 0 1px ${piece.player === 1 ? 'rgba(252,211,77,0.6)' : 'rgba(167,139,250,0.6)'}`
                          : undefined,
                    }}
                  >
                    {piece ? EMOJI[piece.type] : ''}
                    {/* Valid-move dot */}
                    {isValidTarget && (
                      <span
                        style={{
                          position: 'absolute',
                          inset: 0,
                          margin: 'auto',
                          width: piece ? cellSize - 4 : cellSize * 0.36,
                          height: piece ? cellSize - 4 : cellSize * 0.36,
                          borderRadius: piece ? 4 : '50%',
                          background: piece ? 'rgba(244,114,182,0.4)' : 'rgba(110,231,183,0.55)',
                          border: piece
                            ? '2px solid rgba(244,114,182,0.95)'
                            : '2px solid rgba(110,231,183,0.95)',
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Side panel: recorded line + ant rotation pills + controls */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, minWidth: 240, flex: 1 }}>
          <div style={{ padding: 10, borderRadius: 6, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
            <div style={{ fontWeight: 600 }}>
              {finished
                ? '🏆 Puzzle resolves on this line'
                : isAttackerTurn
                  ? `🎯 Attacker (P${attackerSide}) to move`
                  : `⏳ Defender thinking…`}
            </div>
            {labelOffset > 0 && (
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                Click your piece, then click a green target. For ants, pick a post-rotation
                or press "End turn".
              </div>
            )}
          </div>

          {antPending && (
            <div style={{ padding: 10, borderRadius: 6, background: '#fef3c7', border: '1px solid #fbbf24' }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Ant rotation</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {vrots.map(o => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => commitAntRotateTo(o)}
                    style={miniBtnAccent}
                  >
                    ↻ {ORIENTATION_LABEL[o]}
                  </button>
                ))}
                <button type="button" onClick={commitAntNoRotate} style={miniBtn}>
                  End turn (no rotate)
                </button>
              </div>
            </div>
          )}

          <div style={{ padding: 10, borderRadius: 6, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <strong>Attacker line</strong>
              <span style={{ fontSize: 11, color: '#6b7280' }}>{value.length} move{value.length === 1 ? '' : 's'}</span>
            </div>
            {value.length === 0 && (
              <div style={{ fontSize: 12, color: '#6b7280' }}>No moves recorded yet.</div>
            )}
            {value.length > 0 && (
              <ol style={{ margin: 0, paddingInlineStart: 18, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {value.map((m, i) => {
                  // Find a piece description by id from the snapshot or
                  // any prior post-state — fall back to a generic label.
                  const seed = puzzleSnapshotToState(snapshot);
                  const guess = seed.pieces.find(p => p.id === m.pieceId);
                  const what = guess ? `${EMOJI[guess.type]} ${guess.type}` : m.pieceId.slice(0, 8);
                  return (
                    <li key={i}>
                      <strong>▲</strong> {what} → ({m.target.row},{m.target.col})
                      {m.rotateTo && ` ↻${ORIENTATION_LABEL[m.rotateTo]}`}
                    </li>
                  );
                })}
              </ol>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={undo} disabled={value.length === 0} style={miniBtn}>
                ↶ Undo last
              </button>
              <button type="button" onClick={clearAll} disabled={value.length === 0} style={miniBtnDanger}>
                Clear line
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Inline button styles (match PositionEditor's tone) ─────────────────

const miniBtn: React.CSSProperties = {
  padding: '5px 10px',
  background: 'white',
  color: '#1f2937',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
};

const miniBtnAccent: React.CSSProperties = {
  ...miniBtn,
  background: '#fbbf24',
  border: '1px solid #d97706',
  color: '#1f2937',
};

const miniBtnDanger: React.CSSProperties = {
  ...miniBtn,
  color: '#b91c1c',
  border: '1px solid #fca5a5',
};
