import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { isCurrentEngineVersion } from '@/game/puzzleValidator';

// GET /api/puzzles/archive?offset=0&limit=30
//
// The puzzle archive: every published puzzle dated on or before today,
// newest first, annotated with THIS player's attempt status so the list
// can show ✅ solved / 🏳️ gave up / unsolved badges. Solution-bearing
// fields are never selected.
//
// RLS already limits non-admins to published, past-or-today rows, but we
// also filter explicitly so admins (who can read drafts/future rows) see
// the same player-facing archive. Each puzzle carries `available` — false
// when its proof was made against a different engine version, so the UI
// can disable that card instead of routing the player into a 503.

export const runtime = 'nodejs';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 60;

function clampInt(raw: string | null, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), max);
}

export async function GET(req: Request) {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get('limit'), DEFAULT_LIMIT, MAX_LIMIT);
  const offset = clampInt(url.searchParams.get('offset'), 0, Number.MAX_SAFE_INTEGER);
  const today = new Date().toISOString().slice(0, 10);

  // One extra row tells us whether there's another page without a count query.
  const { data, error } = await supabase
    .from('daily_puzzles')
    .select('id, puzzle_date, difficulty, theme, title_en, title_ar, engine_version')
    .eq('status', 'published')
    .lte('puzzle_date', today)
    .order('puzzle_date', { ascending: false })
    .range(offset, offset + limit); // inclusive → limit+1 rows
  if (error) {
    return NextResponse.json({ error: 'failed to load archive', detail: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Pull just this player's attempts for the puzzles on this page so we can
  // stamp each card's status. RLS scopes puzzle_attempts to the caller's own
  // rows, so no user filter is needed beyond the puzzle-id set.
  const ids = page.map(r => r.id as string);
  const statusById = new Map<string, { solved: boolean; gaveUp: boolean; wrongMoves: number }>();
  if (ids.length) {
    const { data: attempts } = await supabase
      .from('puzzle_attempts')
      .select('puzzle_id, solved_at, gave_up_at, wrong_moves')
      .in('puzzle_id', ids);
    for (const a of (attempts ?? []) as Array<Record<string, unknown>>) {
      statusById.set(a.puzzle_id as string, {
        solved: a.solved_at != null,
        gaveUp: a.gave_up_at != null,
        wrongMoves: (a.wrong_moves as number | null) ?? 0,
      });
    }
  }

  const puzzles = page.map(r => {
    const id = r.id as string;
    const st = statusById.get(id);
    return {
      id,
      puzzle_date: r.puzzle_date as string,
      difficulty: r.difficulty as number,
      theme: (r.theme as string | null) ?? null,
      title_en: (r.title_en as string | null) ?? null,
      title_ar: (r.title_ar as string | null) ?? null,
      available: isCurrentEngineVersion(r.engine_version as string | null),
      status: st?.solved ? 'solved' : st?.gaveUp ? 'gave-up' : 'unsolved',
      wrong_moves: st?.wrongMoves ?? 0,
    };
  });

  return NextResponse.json({ puzzles, hasMore, nextOffset: offset + page.length });
}
