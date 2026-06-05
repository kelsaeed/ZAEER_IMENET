'use client';
import PuzzleView from './PuzzleView';

// The daily puzzle. Fetches today's puzzle and renders the shared
// PuzzleView; the archived-puzzle page (/puzzle/[id]) reuses the same
// component with a by-id endpoint.
export default function PuzzlePage() {
  return <PuzzleView endpoint="/api/puzzles/today" backHref="/" />;
}
