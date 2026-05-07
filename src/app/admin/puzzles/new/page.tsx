'use client';
import { useRouter } from 'next/navigation';
import PuzzleEditor from '@/components/admin/PuzzleEditor';

export default function NewPuzzlePage() {
  const router = useRouter();
  return (
    <PuzzleEditor
      mode="new"
      onSavedAndValidated={(id) => router.replace(`/admin/puzzles/${id}`)}
    />
  );
}
