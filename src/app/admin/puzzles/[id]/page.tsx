'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import PuzzleEditor, { type PuzzleEditorInitial } from '@/components/admin/PuzzleEditor';

export default function EditPuzzlePage() {
  const params = useParams<{ id: string }>();
  const [initial, setInitial] = useState<PuzzleEditorInitial | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    const supabase = getSupabaseBrowser();
    supabase
      .from('daily_puzzles')
      .select('id, puzzle_date, position, side_to_move, difficulty, theme, title_en, title_ar, flavour_en, flavour_ar, status, validated_at, engine_version')
      .eq('id', params.id)
      .single()
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        else if (data) setInitial(data as unknown as PuzzleEditorInitial);
      });
  }, [params?.id]);

  if (err) return <div style={{ padding: 24, color: '#b91c1c' }}>Failed to load: {err}</div>;
  if (!initial) return <div style={{ padding: 24 }}>Loading…</div>;

  return <PuzzleEditor mode="edit" puzzleId={initial.id} initial={initial} />;
}
