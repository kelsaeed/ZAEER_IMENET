import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// POST /api/puzzles/[id]/give-up
//
// Marks the attempt as given up and returns the principal line so the
// client can animate "the move was…". Refuses if the puzzle is already
// solved (no need to give up — they won) or already given up.

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: attempt } = await supabase
    .from('puzzle_attempts')
    .select('id, solved_at, gave_up_at')
    .eq('user_id', user.id)
    .eq('puzzle_id', params.id)
    .maybeSingle();
  if (!attempt) {
    return NextResponse.json({ error: 'no attempt to give up' }, { status: 404 });
  }
  if (attempt.solved_at) {
    return NextResponse.json({ error: 'already solved' }, { status: 409 });
  }

  if (!attempt.gave_up_at) {
    const { error: updErr } = await supabase
      .from('puzzle_attempts')
      .update({ gave_up_at: new Date().toISOString() })
      .eq('id', attempt.id);
    if (updErr) {
      return NextResponse.json({ error: 'failed to mark gave-up', detail: updErr.message }, { status: 500 });
    }
  }

  // Service role pulls the principal line — RLS hides the solutions table.
  const admin = getSupabaseAdmin();
  const { data: sol } = await admin
    .from('daily_puzzle_solutions')
    .select('principal_line')
    .eq('puzzle_id', params.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    principalLine: sol?.principal_line ?? [],
  });
}
