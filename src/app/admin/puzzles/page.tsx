'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { getSupabaseBrowser } from '@/lib/supabase/client';

// Minimal admin index page for daily puzzles. Lists every row the
// signed-in admin can see (RLS gives admins access to drafts, queued,
// and future-dated rows on top of the public read of published ones)
// and links into the per-puzzle editor. Intentionally not a CMS — it
// surfaces just the controls a curator needs to validate and ship a
// puzzle for a given date.

interface PuzzleRow {
  id: string;
  puzzle_date: string | null;
  status: 'draft' | 'queued' | 'published' | 'retired';
  difficulty: number;
  theme: string | null;
  title_en: string | null;
  validated_at: string | null;
  engine_version: string | null;
  updated_at: string;
}

export default function AdminPuzzlesPage() {
  const router = useRouter();
  const { user, profile, loading } = useUser();
  const [rows, setRows] = useState<PuzzleRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (!profile?.is_admin) { router.replace('/'); return; }
    const supabase = getSupabaseBrowser();
    supabase
      .from('daily_puzzles')
      .select('id, puzzle_date, status, difficulty, theme, title_en, validated_at, engine_version, updated_at')
      .order('puzzle_date', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        else setRows((data as PuzzleRow[]) ?? []);
      });
  }, [loading, user, profile, router]);

  if (loading || !user || !profile?.is_admin) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Daily puzzles</h1>
        <Link
          href="/admin/puzzles/new"
          style={{
            padding: '8px 14px',
            borderRadius: 6,
            background: '#2563eb',
            color: 'white',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          + New puzzle
        </Link>
      </header>

      {err && <p style={{ color: '#b91c1c' }}>Failed to load: {err}</p>}
      {rows && rows.length === 0 && <p>No puzzles yet — create one to get started.</p>}

      {rows && rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f3f4f6', textAlign: 'left' }}>
              <th style={{ padding: 8 }}>Date</th>
              <th style={{ padding: 8 }}>Status</th>
              <th style={{ padding: 8 }}>Difficulty</th>
              <th style={{ padding: 8 }}>Theme</th>
              <th style={{ padding: 8 }}>Title</th>
              <th style={{ padding: 8 }}>Validated</th>
              <th style={{ padding: 8 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: 8 }}>{r.puzzle_date ?? '—'}</td>
                <td style={{ padding: 8 }}><StatusPill status={r.status} /></td>
                <td style={{ padding: 8 }}>{r.difficulty}</td>
                <td style={{ padding: 8 }}>{r.theme ?? '—'}</td>
                <td style={{ padding: 8 }}>{r.title_en ?? '—'}</td>
                <td style={{ padding: 8 }}>{r.validated_at ? '✓' : '—'}</td>
                <td style={{ padding: 8 }}>
                  <Link href={`/admin/puzzles/${r.id}`} style={{ color: '#2563eb' }}>Edit</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function StatusPill({ status }: { status: PuzzleRow['status'] }) {
  const colours: Record<PuzzleRow['status'], { bg: string; fg: string }> = {
    draft:     { bg: '#fef3c7', fg: '#92400e' },
    queued:    { bg: '#dbeafe', fg: '#1e40af' },
    published: { bg: '#dcfce7', fg: '#166534' },
    retired:   { bg: '#e5e7eb', fg: '#374151' },
  };
  const c = colours[status];
  return (
    <span style={{
      background: c.bg, color: c.fg,
      padding: '2px 8px', borderRadius: 12,
      fontSize: 12, fontWeight: 600,
    }}>
      {status}
    </span>
  );
}
