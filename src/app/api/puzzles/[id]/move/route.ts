import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isCurrentEngineVersion } from '@/game/puzzleValidator';
import { ENGINE_VERSION } from '@/game/engineVersion';
import {
  type PuzzleMove,
  type SolutionNode,
} from '@/game/puzzleTypes';
import { cursorAfterMoves, resolveSubmission } from '@/lib/puzzles/session';

// POST /api/puzzles/[id]/move
//
// Body: { move: PuzzleMove }
//
// Server walks the proven solution tree using the player's prior
// submissions as a cursor, then matches the new submission against the
// expected attacker move. The full solution is loaded with the service
// role (RLS hides it from the player); the response NEVER contains the
// expected move on a wrong submission, so the player can't bisect their
// way to the answer.
//
// On a correct move, the canonical defender reply (defenderBranches[0])
// is returned so the client can render the next position. On a solving
// move, solved=true and the attempt's solved_at + time_seconds are set
// (which fires the streak update trigger).

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const move = (body as { move?: PuzzleMove } | null)?.move;
  if (!move || typeof move !== 'object' || typeof move.pieceId !== 'string') {
    return NextResponse.json({ error: 'missing or invalid move' }, { status: 400 });
  }

  // 1. Puzzle must exist, be live, and not have engine-drift.
  const { data: puzzle } = await supabase
    .from('daily_puzzles')
    .select('id, engine_version')
    .eq('id', params.id)
    .maybeSingle();
  if (!puzzle) {
    return NextResponse.json({ error: 'puzzle not available' }, { status: 404 });
  }
  if (!isCurrentEngineVersion(puzzle.engine_version as string | null)) {
    return NextResponse.json({
      error: 'puzzle temporarily unavailable',
      reason: 'engine-version-mismatch',
    }, { status: 503 });
  }

  // 2. Load (or auto-create) the attempt. Auto-create here means a
  //    player who skips the /start call still gets a valid attempt;
  //    started_at = first move time in that case, slightly less
  //    accurate than the /start path but still correct.
  let { data: attempt } = await supabase
    .from('puzzle_attempts')
    .select('id, started_at, solved_at, gave_up_at, wrong_moves, submitted_moves, validated_engine_version')
    .eq('user_id', user.id)
    .eq('puzzle_id', params.id)
    .maybeSingle();

  if (!attempt) {
    const { data: created, error: insErr } = await supabase
      .from('puzzle_attempts')
      .insert({
        user_id: user.id,
        puzzle_id: params.id,
        validated_engine_version: ENGINE_VERSION,
      })
      .select('id, started_at, solved_at, gave_up_at, wrong_moves, submitted_moves, validated_engine_version')
      .single();
    if (insErr || !created) {
      return NextResponse.json({ error: 'failed to start attempt', detail: insErr?.message }, { status: 500 });
    }
    attempt = created;
  }

  if (attempt.solved_at) {
    return NextResponse.json({ ok: true, result: 'already-solved' });
  }
  if (attempt.gave_up_at) {
    return NextResponse.json({ error: 'attempt was given up' }, { status: 409 });
  }
  if (
    attempt.validated_engine_version
    && attempt.validated_engine_version !== ENGINE_VERSION
  ) {
    // Engine bumped mid-attempt. Refusing further submissions keeps the
    // attempt's judgement consistent with the tree it started against.
    return NextResponse.json({
      error: 'puzzle re-validated mid-attempt; please start over',
      reason: 'engine-version-mismatch',
    }, { status: 409 });
  }

  // 3. Load the solution tree with the service role (RLS hides this
  //    table from the player session). principal_line is fetched in the
  //    same query so the solved response can return it without a second
  //    round-trip — letting the client play back the canonical line in
  //    the post-solve replayer.
  const admin = getSupabaseAdmin();
  const { data: sol, error: solErr } = await admin
    .from('daily_puzzle_solutions')
    .select('solution_tree, principal_line')
    .eq('puzzle_id', params.id)
    .maybeSingle();
  if (solErr || !sol) {
    return NextResponse.json({ error: 'puzzle solution not available' }, { status: 500 });
  }
  const tree = sol.solution_tree as SolutionNode;
  const principalLine = sol.principal_line as unknown[] | null;

  // 4. Replay the prior attacker submissions to find the cursor, then
  //    judge the new submission against it.
  const prior = (attempt.submitted_moves as PuzzleMove[] | null) ?? [];
  const cursor = cursorAfterMoves(tree, prior);
  const result = resolveSubmission(cursor, move);

  if (!result.correct) {
    // Wrong move — increment counter, do NOT reveal the right answer.
    await supabase
      .from('puzzle_attempts')
      .update({ wrong_moves: (attempt.wrong_moves ?? 0) + 1 })
      .eq('id', attempt.id);
    return NextResponse.json({ ok: true, result: 'wrong' });
  }

  // 5. Correct submission. Append to submitted_moves; if solved, stamp
  //    solved_at + time_seconds (the trigger updates the streak).
  const newMoves = [...prior, move];
  const update: Record<string, unknown> = { submitted_moves: newMoves };
  if (result.solved) {
    const startedMs = new Date(attempt.started_at as string).getTime();
    update.solved_at = new Date().toISOString();
    update.time_seconds = Math.max(0, Math.round((Date.now() - startedMs) / 1000));
  }
  const { error: updErr } = await supabase
    .from('puzzle_attempts')
    .update(update)
    .eq('id', attempt.id);
  if (updErr) {
    return NextResponse.json({ error: 'failed to record move', detail: updErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    result: result.solved ? 'solved' : 'continue',
    defenderReply: result.defenderReply ?? null,
    // Surface the canonical line on solve so the client's replayer can
    // walk through it without a separate fetch. Omitted on 'continue'
    // submissions to avoid leaking the rest of the solution mid-attempt.
    ...(result.solved ? { principalLine: principalLine ?? [] } : {}),
  });
}
