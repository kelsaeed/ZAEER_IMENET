import { ImageResponse } from 'next/og';
import { getSupabaseServer } from '@/lib/supabase/server';
import { BOARD_SIZE, isBarrier, isThrone } from '@/game/constants';
import { parsePuzzleSnapshot } from '@/game/puzzleTypes';
import type { GamePiece } from '@/game/types';

// Open Graph card for /puzzle. Next.js auto-routes this file to
// /puzzle/opengraph-image and surfaces it via the `og:image` meta on
// the puzzle page when generateMetadata in layout.tsx isn't overriding.
//
// The card is generated on the server with the live position of
// today's puzzle so a friend who lands on a shared link sees the
// actual board they're being challenged with — not a generic
// branded thumbnail.

export const runtime = 'nodejs';
// Render per-request, never at build time. The OG image embeds the
// live puzzle position so static generation would either bake in a
// snapshot from the build moment or — when the build server has no
// supabase env / no puzzle for today — feed `undefined` into the
// satori renderer, which fails with "Cannot read properties of
// undefined (reading 'trim')". `force-dynamic` makes Vercel call the
// handler on every request.
export const dynamic = 'force-dynamic';
export const alt = 'Zaeer Imenet — Daily Puzzle';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const PIECE_EMOJI: Record<string, string> = {
  lion: '🦁',
  elephant: '🐘',
  monkey: '🐒',
  bat: '🦇',
  butterfly: '🦋',
  ant: '🐜',
};

// Board palette tuned for OG: dark plum bg, warm cream cells, gold
// throne, dusky barrier — enough contrast to read clearly when
// platforms shrink the card to ~600 px wide previews.
const PALETTE = {
  bg:        '#0c0e2e',
  cellLight: '#3b3f8a',
  cellDark:  '#11142e',
  throneBg:  '#d4a017',
  barrier:   '#1a3a45',
  rim:       'rgba(252,211,77,0.55)',
  text:      '#f5f7ff',
  muted:     'rgba(245,247,255,0.7)',
  p1Tint:    'rgba(252,211,77,0.45)',
  p2Tint:    'rgba(167,139,250,0.45)',
  accent:    '#fcd34d',
};

interface PuzzleRow {
  id: string;
  puzzle_date: string;
  position: unknown;
  side_to_move: 1 | 2;
  difficulty: number;
  title_en: string | null;
}

export default async function OpenGraphImage() {
  // Try to render today's actual puzzle. Anything that goes wrong —
  // no puzzle, parse failure, supabase down — falls through to a
  // generic branded card so the OG image is never broken.
  let puzzle: PuzzleRow | null = null;
  let pieces: GamePiece[] = [];
  try {
    const supabase = getSupabaseServer();
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('daily_puzzles')
      .select('id, puzzle_date, position, side_to_move, difficulty, title_en')
      .eq('status', 'published')
      .eq('puzzle_date', today)
      .maybeSingle();
    if (data) {
      puzzle = data as unknown as PuzzleRow;
      const snap = parsePuzzleSnapshot(puzzle.position);
      pieces = snap.pieces;
    }
  } catch {
    /* fall through to generic card */
  }

  const cell = 28; // px — 16 cells × 28 = 448 px board
  const boardSize = cell * BOARD_SIZE;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(135deg, ${PALETTE.bg}, #1a1f5c 60%, ${PALETTE.bg})`,
          color: PALETTE.text,
          padding: 50,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Header band */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 30 }}>
          <span style={{ fontSize: 56 }}>🧩</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 44, fontWeight: 800, color: PALETTE.accent, lineHeight: 1 }}>
              Daily Puzzle
            </span>
            <span style={{ fontSize: 20, color: PALETTE.muted, marginTop: 6 }}>
              Zaeer Imenet · The Ancient Strategy Game
            </span>
          </div>
        </div>

        {/* Body: board on the left, copy + branding on the right */}
        <div style={{ display: 'flex', flex: 1, gap: 50, alignItems: 'center' }}>
          {/* Board */}
          <div
            style={{
              width: boardSize + 8,
              height: boardSize + 8,
              padding: 4,
              borderRadius: 12,
              background: 'rgba(8,10,30,0.55)',
              border: `2px solid ${PALETTE.rim}`,
              boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {Array.from({ length: BOARD_SIZE }).map((_, row) => (
              <div key={row} style={{ display: 'flex' }}>
                {Array.from({ length: BOARD_SIZE }).map((_, col) => {
                  const throne = isThrone(row, col);
                  const barrier = isBarrier(row, col);
                  const isEven = (row + col) % 2 === 0;
                  let bg = isEven ? PALETTE.cellLight : PALETTE.cellDark;
                  if (throne) bg = PALETTE.throneBg;
                  if (barrier) bg = PALETTE.barrier;
                  const piece = pieces.find(p => p.row === row && p.col === col);
                  const pieceTint = piece
                    ? piece.player === 1 ? PALETTE.p1Tint : PALETTE.p2Tint
                    : null;
                  // Always render a non-empty string in the cell. Satori
                  // walks children and calls .trim() on text nodes; an
                  // empty cell that resolves to `undefined` (the result
                  // of `piece && PIECE_EMOJI[piece.type]` when piece is
                  // missing) crashes the renderer at build time.
                  const glyph = piece ? (PIECE_EMOJI[piece.type] ?? '·') : '·';
                  const showGlyph = !!piece;
                  return (
                    <div
                      key={col}
                      style={{
                        width: cell,
                        height: cell,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: pieceTint
                          ? `linear-gradient(${pieceTint}, ${pieceTint}), ${bg}`
                          : bg,
                        borderRight: col < BOARD_SIZE - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined,
                        borderBottom: row < BOARD_SIZE - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined,
                        fontSize: cell - 8,
                        lineHeight: 1,
                        color: showGlyph ? '#fff' : 'transparent',
                      }}
                    >
                      {glyph}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Right column: title, side-to-move, difficulty stars */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 16 }}>
            <span style={{ fontSize: 22, color: PALETTE.muted }}>
              {puzzle?.puzzle_date ?? new Date().toISOString().slice(0, 10)}
            </span>
            <span style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.1 }}>
              {puzzle?.title_en ?? "Today's puzzle"}
            </span>

            {puzzle && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                <span style={{ fontSize: 26, color: PALETTE.accent }}>
                  {'★'.repeat(puzzle.difficulty)}
                  <span style={{ color: 'rgba(252,211,77,0.25)' }}>
                    {'★'.repeat(Math.max(0, 5 - puzzle.difficulty))}
                  </span>
                </span>
              </div>
            )}

            {puzzle && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 8,
                  padding: '10px 16px',
                  borderRadius: 999,
                  background: puzzle.side_to_move === 1 ? 'rgba(252,211,77,0.14)' : 'rgba(167,139,250,0.18)',
                  border: `1px solid ${puzzle.side_to_move === 1 ? 'rgba(252,211,77,0.55)' : 'rgba(167,139,250,0.55)'}`,
                  color: puzzle.side_to_move === 1 ? '#fcd34d' : '#c4b5fd',
                  alignSelf: 'flex-start',
                  fontSize: 20,
                  fontWeight: 700,
                }}
              >
                {puzzle.side_to_move === 1 ? '🦁 Player 1 to move' : '🦁 Player 2 to move'}
              </div>
            )}

            {!puzzle && (
              <span style={{ fontSize: 22, color: PALETTE.muted, marginTop: 6 }}>
                Solve the daily puzzle to keep your streak alive.
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 24,
            paddingTop: 20,
            borderTop: '1px solid rgba(255,255,255,0.12)',
            fontSize: 22,
          }}
        >
          <span style={{ color: PALETTE.muted }}>Play it free · zaeer-imenet.vercel.app</span>
          <span style={{ color: PALETTE.accent, fontWeight: 700 }}>
            🏆 Solve · Share · Streak
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
