'use client';
import { useParams } from 'next/navigation';
import PuzzleView from '../PuzzleView';

// Play one archived (past) puzzle by id. Reuses the daily-puzzle view with
// a by-id endpoint; the back arrow returns to the archive list rather than
// the main menu. The static /puzzle/archive route takes precedence over
// this dynamic segment, so "archive" never resolves here.
export default function ArchivedPuzzlePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) return null;
  return (
    <PuzzleView
      endpoint={`/api/puzzles/${id}`}
      backHref="/puzzle/archive"
      isArchive
    />
  );
}
