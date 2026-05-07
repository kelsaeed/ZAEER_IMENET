import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { isCurrentEngineVersion } from '@/game/puzzleValidator';
import { ENGINE_VERSION } from '@/game/engineVersion';

// POST /api/puzzles/[id]/start
//
// Idempotent: creates a puzzle_attempts row if the player hasn't started
// this puzzle yet, otherwise returns the existing attempt. Used by the
// client right after the puzzle UI mounts so started_at reflects when
// they opened the puzzle, not when they made their first move.

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Confirm the puzzle is currently servable. RLS already gates on
  // status='published' AND date<=today, so a successful select implies
  // both — but we also need to refuse stale-engine puzzles, which RLS
  // can't enforce.
  const { data: puzzle, error: pErr } = await supabase
    .from('daily_puzzles')
    .select('id, engine_version')
    .eq('id', params.id)
    .maybeSingle();
  if (pErr) {
    return NextResponse.json({ error: 'failed to load puzzle' }, { status: 500 });
  }
  if (!puzzle) {
    return NextResponse.json({ error: 'puzzle not available' }, { status: 404 });
  }
  if (!isCurrentEngineVersion(puzzle.engine_version as string | null)) {
    return NextResponse.json({
      error: 'puzzle temporarily unavailable',
      reason: 'engine-version-mismatch',
    }, { status: 503 });
  }

  // Existing attempt? Return it.
  const { data: existing } = await supabase
    .from('puzzle_attempts')
    .select('id, started_at, solved_at, gave_up_at, wrong_moves, submitted_moves')
    .eq('user_id', user.id)
    .eq('puzzle_id', params.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ attempt: existing, resumed: true });
  }

  const { data: created, error: insErr } = await supabase
    .from('puzzle_attempts')
    .insert({
      user_id: user.id,
      puzzle_id: params.id,
      validated_engine_version: ENGINE_VERSION,
    })
    .select('id, started_at, solved_at, gave_up_at, wrong_moves, submitted_moves')
    .single();
  if (insErr || !created) {
    return NextResponse.json({ error: 'failed to start attempt', detail: insErr?.message }, { status: 500 });
  }
  return NextResponse.json({ attempt: created, resumed: false });
}
