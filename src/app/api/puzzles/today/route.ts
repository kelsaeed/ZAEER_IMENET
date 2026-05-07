import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { isCurrentEngineVersion } from '@/game/puzzleValidator';

// GET /api/puzzles/today
//
// Returns the puzzle published for today (or 404 if none has been queued).
// Strips solution-bearing fields by design — only the position, side to
// move, and curator-facing metadata are sent.
//
// Engine-version drift: if the puzzle was proven against a different
// engine version than the current one, the player API treats it as
// "temporarily unavailable" and returns 503. This is the same gate the
// /move endpoint applies, so once we hide a puzzle here we can never
// accidentally accept moves against a stale tree.

export const runtime = 'nodejs';

export async function GET() {
  const supabase = getSupabaseServer();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data, error } = await supabase
    .from('daily_puzzles')
    .select(
      'id, puzzle_date, position, position_version, side_to_move, ' +
      'difficulty, theme, title_en, title_ar, flavour_en, flavour_ar, engine_version'
    )
    .eq('status', 'published')
    .eq('puzzle_date', today)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'failed to load puzzle', detail: error.message }, { status: 500 });
  }
  // Cast at the read site: the project's supabase client isn't typed
  // against the generated Database schema, so .from() narrows to the
  // ambient never-shape and we re-broaden here. Mirrors the pattern in
  // src/lib/supabase/games.ts.
  const row = data as Record<string, unknown> | null;
  if (!row) {
    return NextResponse.json({ error: 'no puzzle for today' }, { status: 404 });
  }
  if (!isCurrentEngineVersion(row.engine_version as string | null)) {
    return NextResponse.json({
      error: 'puzzle temporarily unavailable',
      reason: 'engine-version-mismatch',
    }, { status: 503 });
  }

  // Drop engine_version from the response — it's a server-only concern.
  const { engine_version: _ev, ...payload } = row;
  void _ev;
  return NextResponse.json(payload);
}
