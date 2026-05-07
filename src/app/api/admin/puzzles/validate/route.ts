import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  parsePuzzleSnapshot,
  type AttackerMove,
  CURRENT_SNAPSHOT_VERSION,
} from '@/game/puzzleTypes';
import { validatePuzzle } from '@/game/puzzleValidator';

// POST /api/admin/puzzles/validate
//
// Body:
//   {
//     puzzleId?:    string,            // when editing an existing draft
//     position:     PuzzleSnapshotV1,  // { v, sideToMove, pieces[] }
//     claimedAttackerLine: AttackerMove[],
//     difficulty?:  number,
//     theme?:       string,
//     title_en?:    string,
//     title_ar?:    string,
//     flavour_en?:  string,
//     flavour_ar?:  string,
//   }
//
// On success: upserts the daily_puzzles row (status remains 'draft' —
// the curator separately moves it to 'queued' or 'published') AND the
// daily_puzzle_solutions row holding the proven tree. Sets validated_at
// and engine_version.
//
// On failure: returns a 422 with the validator's structured failure so
// the admin UI can show "defender escapes with bat e3 → c4" verbatim.

export const runtime = 'nodejs'; // engine uses performance.now()

export async function POST(req: Request) {
  // 1. Auth — must be a signed-in admin.
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // 2. Parse + sanity-check the request body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  let snapshot;
  try {
    snapshot = parsePuzzleSnapshot(b.position);
  } catch (e) {
    return NextResponse.json({
      error: 'invalid position',
      message: e instanceof Error ? e.message : String(e),
    }, { status: 400 });
  }

  const claimedAttackerLine = Array.isArray(b.claimedAttackerLine)
    ? (b.claimedAttackerLine as AttackerMove[])
    : null;
  if (!claimedAttackerLine || claimedAttackerLine.length === 0) {
    return NextResponse.json({
      error: 'claimedAttackerLine must be a non-empty array',
    }, { status: 400 });
  }

  // 3. Run the validator.
  const result = validatePuzzle({ snapshot, claimedAttackerLine });
  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      reason: result.reason,
      message: result.message,
      escapeLine: result.escapeLine ?? null,
    }, { status: 422 });
  }

  // 4. Persist. We use the admin client here because we want to set
  //    author_id atomically AND because we want validated_at + engine
  //    stamps to come from the validator, not the curator's payload.
  const admin = getSupabaseAdmin();

  const puzzleId = typeof b.puzzleId === 'string' ? b.puzzleId : null;
  const meta = {
    position: snapshot,
    position_version: CURRENT_SNAPSHOT_VERSION,
    side_to_move: snapshot.sideToMove,
    difficulty: clampDifficulty(b.difficulty),
    theme: typeof b.theme === 'string' ? b.theme : null,
    title_en: typeof b.title_en === 'string' ? b.title_en : null,
    title_ar: typeof b.title_ar === 'string' ? b.title_ar : null,
    flavour_en: typeof b.flavour_en === 'string' ? b.flavour_en : null,
    flavour_ar: typeof b.flavour_ar === 'string' ? b.flavour_ar : null,
    validated_at: new Date().toISOString(),
    engine_version: result.engineVersion,
    author_id: user.id,
  };

  let savedPuzzleId: string;
  if (puzzleId) {
    const { error } = await admin
      .from('daily_puzzles')
      .update(meta)
      .eq('id', puzzleId);
    if (error) {
      return NextResponse.json({ error: 'failed to update puzzle', detail: error.message }, { status: 500 });
    }
    savedPuzzleId = puzzleId;
  } else {
    const { data, error } = await admin
      .from('daily_puzzles')
      .insert({ ...meta, status: 'draft' })
      .select('id')
      .single();
    if (error || !data) {
      return NextResponse.json({ error: 'failed to insert puzzle', detail: error?.message }, { status: 500 });
    }
    savedPuzzleId = data.id as string;
  }

  // Upsert the solution tree alongside the puzzle row.
  const { error: solErr } = await admin
    .from('daily_puzzle_solutions')
    .upsert({
      puzzle_id: savedPuzzleId,
      solution_tree: result.solutionTree,
      principal_line: result.principalLine,
      engine_version: result.engineVersion,
    }, { onConflict: 'puzzle_id' });
  if (solErr) {
    return NextResponse.json({ error: 'failed to save solution', detail: solErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    puzzleId: savedPuzzleId,
    validatedAt: meta.validated_at,
    engineVersion: result.engineVersion,
    principalLine: result.principalLine,
  });
}

function clampDifficulty(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return 3;
  return Math.max(1, Math.min(5, Math.round(input)));
}
