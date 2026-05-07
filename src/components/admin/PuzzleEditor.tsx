'use client';
import { useMemo, useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import type { AttackerMove, PuzzleSnapshotV1 } from '@/game/puzzleTypes';

// Minimal puzzle authoring UI. Per project guidance, this is intentionally
// not a full CMS — the position editor is JSON-paste, not drag-and-drop,
// and the validation happens through the existing /api/admin/puzzles/
// validate route. The visual board editor is a phase-2 enhancement.

export interface PuzzleEditorInitial {
  id: string;
  puzzle_date: string | null;
  position: PuzzleSnapshotV1;
  side_to_move: 1 | 2;
  difficulty: number;
  theme: string | null;
  title_en: string | null;
  title_ar: string | null;
  flavour_en: string | null;
  flavour_ar: string | null;
  status: 'draft' | 'queued' | 'published' | 'retired';
  validated_at: string | null;
  engine_version: string | null;
}

interface Props {
  mode: 'new' | 'edit';
  puzzleId?: string;
  initial?: PuzzleEditorInitial;
  onSavedAndValidated?: (id: string) => void;
}

interface ValidateResult {
  ok: boolean;
  reason?: string;
  message?: string;
  escapeLine?: unknown;
  puzzleId?: string;
  validatedAt?: string;
  principalLine?: unknown;
}

export default function PuzzleEditor({ mode, puzzleId, initial, onSavedAndValidated }: Props) {
  const [positionJson, setPositionJson] = useState(
    initial ? JSON.stringify(initial.position, null, 2) : SAMPLE_POSITION
  );
  const [solutionJson, setSolutionJson] = useState('[]');
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? 3);
  const [theme, setTheme] = useState(initial?.theme ?? '');
  const [titleEn, setTitleEn] = useState(initial?.title_en ?? '');
  const [titleAr, setTitleAr] = useState(initial?.title_ar ?? '');
  const [flavourEn, setFlavourEn] = useState(initial?.flavour_en ?? '');
  const [flavourAr, setFlavourAr] = useState(initial?.flavour_ar ?? '');
  const [puzzleDate, setPuzzleDate] = useState(initial?.puzzle_date ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ValidateResult | null>(null);

  const status = initial?.status ?? 'draft';
  const validatedAt = initial?.validated_at ?? result?.validatedAt ?? null;

  const importJsonCombined = useMemo(() => {
    // Lets curators paste a single { position, solution, ...meta } blob
    // exported from another puzzle. Parsed lazily on the import button.
    return '';
  }, []);

  async function onValidate() {
    setBusy(true);
    setResult(null);
    let position: unknown;
    let claimed: AttackerMove[];
    try { position = JSON.parse(positionJson); }
    catch (e) {
      setBusy(false);
      setResult({ ok: false, message: `Position is not valid JSON: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    try {
      const parsed = JSON.parse(solutionJson);
      if (!Array.isArray(parsed)) throw new Error('solution must be a JSON array of moves');
      claimed = parsed as AttackerMove[];
    } catch (e) {
      setBusy(false);
      setResult({ ok: false, message: `Solution is not valid JSON: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    try {
      const res = await fetch('/api/admin/puzzles/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          puzzleId: puzzleId ?? null,
          position,
          claimedAttackerLine: claimed,
          difficulty,
          theme: theme || null,
          title_en: titleEn || null,
          title_ar: titleAr || null,
          flavour_en: flavourEn || null,
          flavour_ar: flavourAr || null,
        }),
      });
      const data = await res.json() as ValidateResult;
      setResult(data);
      if (data.ok && data.puzzleId && onSavedAndValidated) onSavedAndValidated(data.puzzleId);
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function onSetStatus(next: 'draft' | 'queued' | 'published' | 'retired') {
    if (!puzzleId) return;
    if (next === 'published' && !puzzleDate) {
      alert('Set a puzzle date before publishing.');
      return;
    }
    if (next === 'published' && !validatedAt) {
      alert('Validate the puzzle before publishing.');
      return;
    }
    setBusy(true);
    const supabase = getSupabaseBrowser();
    const update: Record<string, unknown> = { status: next };
    if (puzzleDate) update.puzzle_date = puzzleDate;
    const { error } = await supabase
      .from('daily_puzzles')
      .update(update)
      .eq('id', puzzleId);
    setBusy(false);
    if (error) {
      alert(`Failed: ${error.message}`);
      return;
    }
    location.reload();
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
        {mode === 'new' ? 'New puzzle' : 'Edit puzzle'}
      </h1>

      {puzzleId && (
        <div style={{ marginBottom: 16, padding: 12, background: '#f9fafb', borderRadius: 6, fontSize: 13 }}>
          <div>ID: <code>{puzzleId}</code></div>
          <div>Status: <strong>{status}</strong></div>
          <div>Validated: <strong>{validatedAt ? validatedAt : '— not yet —'}</strong></div>
        </div>
      )}

      <Section title="Metadata">
        <Row>
          <Field label="Puzzle date (YYYY-MM-DD)">
            <input
              type="date"
              value={puzzleDate}
              onChange={e => setPuzzleDate(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Difficulty (1–5)">
            <input
              type="number" min={1} max={5}
              value={difficulty}
              onChange={e => setDifficulty(Number(e.target.value) || 3)}
              style={inputStyle}
            />
          </Field>
          <Field label="Theme">
            <input
              type="text"
              value={theme}
              onChange={e => setTheme(e.target.value)}
              placeholder="e.g. ant fork, bat paralysis"
              style={inputStyle}
            />
          </Field>
        </Row>
        <Row>
          <Field label="Title (EN)">
            <input type="text" value={titleEn} onChange={e => setTitleEn(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Title (AR)">
            <input type="text" value={titleAr} onChange={e => setTitleAr(e.target.value)} style={inputStyle} dir="rtl" />
          </Field>
        </Row>
        <Row>
          <Field label="Flavour (EN)">
            <input type="text" value={flavourEn} onChange={e => setFlavourEn(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Flavour (AR)">
            <input type="text" value={flavourAr} onChange={e => setFlavourAr(e.target.value)} style={inputStyle} dir="rtl" />
          </Field>
        </Row>
      </Section>

      <Section title="Position (JSON)">
        <p style={hint}>
          Paste a <code>PuzzleSnapshotV1</code>: <code>{'{ v: 1, sideToMove, pieces[] }'}</code>.
          Each piece needs id, type, player, row, col; optional fields default sensibly.
        </p>
        <textarea
          value={positionJson}
          onChange={e => setPositionJson(e.target.value)}
          rows={14}
          spellCheck={false}
          style={textareaStyle}
        />
      </Section>

      <Section title="Solution (JSON)">
        <p style={hint}>
          Array of attacker moves: <code>{'[{ pieceId, target: { row, col }, rotateTo? }, ...]'}</code>.
          Length sets the depth budget — three moves = mate-in-3.
        </p>
        <textarea
          value={solutionJson}
          onChange={e => setSolutionJson(e.target.value)}
          rows={10}
          spellCheck={false}
          style={textareaStyle}
        />
      </Section>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <button onClick={onValidate} disabled={busy} style={primaryButton}>
          {busy ? 'Working…' : 'Validate & save'}
        </button>
        {puzzleId && status !== 'queued' && (
          <button onClick={() => onSetStatus('queued')} disabled={busy} style={secondaryButton}>
            Move to queued
          </button>
        )}
        {puzzleId && status !== 'published' && (
          <button onClick={() => onSetStatus('published')} disabled={busy} style={secondaryButton}>
            Publish
          </button>
        )}
        {puzzleId && status !== 'retired' && (
          <button onClick={() => onSetStatus('retired')} disabled={busy} style={secondaryButton}>
            Retire
          </button>
        )}
      </div>

      {result && (
        <div style={{
          marginTop: 16, padding: 12, borderRadius: 6,
          background: result.ok ? '#dcfce7' : '#fee2e2',
          color: result.ok ? '#166534' : '#991b1b',
        }}>
          {result.ok
            ? <>Validated. Puzzle saved as <code>{result.puzzleId}</code> at {result.validatedAt}.</>
            : <>Validation failed{result.reason ? ` — ${result.reason}` : ''}: {result.message ?? '(no detail)'}</>}
          {result.escapeLine ? (
            <pre style={{ marginTop: 8, overflowX: 'auto', fontSize: 12 }}>
              {JSON.stringify(result.escapeLine, null, 2)}
            </pre>
          ) : null}
        </div>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{title}</h2>
      {children}
    </section>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 8 }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
      <span style={{ color: '#374151' }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  fontSize: 14,
};
const textareaStyle: React.CSSProperties = {
  width: '100%',
  fontFamily: 'monospace',
  fontSize: 12,
  padding: 8,
  border: '1px solid #d1d5db',
  borderRadius: 4,
};
const primaryButton: React.CSSProperties = {
  padding: '8px 16px',
  background: '#2563eb',
  color: 'white',
  border: 0,
  borderRadius: 6,
  fontWeight: 600,
  cursor: 'pointer',
};
const secondaryButton: React.CSSProperties = {
  padding: '8px 16px',
  background: 'white',
  color: '#1f2937',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontWeight: 600,
  cursor: 'pointer',
};
const hint: React.CSSProperties = { fontSize: 12, color: '#6b7280', marginBottom: 6 };

const SAMPLE_POSITION = `{
  "v": 1,
  "sideToMove": 1,
  "pieces": [
    { "id": "lion_p1_1",  "type": "lion",  "player": 1, "row": 15, "col": 1, "hp": 1, "isDamaged": false, "isParalyzed": false },
    { "id": "lion_p2_1",  "type": "lion",  "player": 2, "row": 0,  "col": 14, "hp": 1, "isDamaged": false, "isParalyzed": false }
  ]
}`;
