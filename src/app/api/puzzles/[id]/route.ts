import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { isCurrentEngineVersion } from '@/game/puzzleValidator';

// GET /api/puzzles/[id]
//
// Fetch one published puzzle by id — the archive's "play a past puzzle"
// counterpart to /api/puzzles/today. RLS ("daily_puzzles read live")
// already restricts the player session to published rows dated on or
// before today, so a successful select implies the puzzle is fair game;
// drafts, queued, and future-dated rows simply don't come back.
//
// Like /today, this strips solution-bearing fields (only the position,
// side to move, and curator metadata go out) and treats an engine-version
// mismatch as "temporarily unavailable" (503) so a stale proof can never
// be played against.

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServer();

  const { data, error } = await supabase
    .from('daily_puzzles')
    .select(
      'id, puzzle_date, position, position_version, side_to_move, ' +
      'difficulty, theme, title_en, title_ar, flavour_en, flavour_ar, engine_version, status'
    )
    .eq('id', params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'failed to load puzzle', detail: error.message }, { status: 500 });
  }
  // See /today for why we re-broaden the row type here.
  const row = data as Record<string, unknown> | null;
  if (!row || row.status !== 'published') {
    return NextResponse.json({ error: 'puzzle not available' }, { status: 404 });
  }
  if (!isCurrentEngineVersion(row.engine_version as string | null)) {
    return NextResponse.json({
      error: 'puzzle temporarily unavailable',
      reason: 'engine-version-mismatch',
    }, { status: 503 });
  }

  // Drop server-only fields from the response.
  const { engine_version: _ev, status: _st, ...payload } = row;
  void _ev; void _st;
  return NextResponse.json(payload);
}
