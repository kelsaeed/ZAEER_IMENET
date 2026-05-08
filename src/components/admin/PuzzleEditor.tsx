'use client';
import { useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import type { AttackerMove, PuzzleSnapshotV1, PuzzleMove } from '@/game/puzzleTypes';
import PositionEditor from './PositionEditor';
import SolutionRecorder from './SolutionRecorder';

// Minimal puzzle authoring UI. The position is built visually via
// <PositionEditor/> (click-to-place pieces on a 16×16 board);
// validation goes through the existing /api/admin/puzzles/validate
// route. Solution moves are still authored as JSON for v1.

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

// A blank starting snapshot — just two lions at their default
// corners — used as the seed when an admin creates a new puzzle.
const BLANK_SNAPSHOT: PuzzleSnapshotV1 = {
  v: 1,
  sideToMove: 1,
  pieces: [
    { id: 'lion_p1_seed', type: 'lion', player: 1, row: 15, col: 1,  hp: 1, isDamaged: false, isParalyzed: false },
    { id: 'lion_p2_seed', type: 'lion', player: 2, row: 0,  col: 14, hp: 1, isDamaged: false, isParalyzed: false },
  ],
};

export default function PuzzleEditor({ mode, puzzleId, initial, onSavedAndValidated }: Props) {
  // Position is the canonical state now; the JSON textarea was replaced
  // by <PositionEditor/>. We keep a typed snapshot in state and derive
  // a JSON string for the validate request body.
  const [snapshot, setSnapshot] = useState<PuzzleSnapshotV1>(
    initial?.position ?? BLANK_SNAPSHOT
  );
  // Recorded attacker line — built visually via <SolutionRecorder/>.
  // We still hold the raw array in state (rather than a JSON string)
  // so the validate request body uses the typed shape directly.
  const [attackerLine, setAttackerLine] = useState<PuzzleMove[]>([]);
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

  async function onValidate() {
    setBusy(true);
    setResult(null);
    if (attackerLine.length === 0) {
      setBusy(false);
      setResult({ ok: false, message: 'Record at least one attacker move before validating.' });
      return;
    }
    const claimed = attackerLine as AttackerMove[];
    try {
      const res = await fetch('/api/admin/puzzles/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          puzzleId: puzzleId ?? null,
          position: snapshot,
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

      <Section title="Position">
        <p style={hint}>
          Pick a piece from the palette and click a cell to place it.
          Use the eraser to remove. Click an ant with the rotate tool
          to cycle its orientation. Side to move flips up top.
        </p>
        <PositionEditor value={snapshot} onChange={setSnapshot} />
      </Section>

      <Section title="Solution">
        <p style={hint}>
          Click your piece, then click a green target — that records one
          attacker move. The local AI plays the defender between turns
          just so you can see the next position; the validator on save
          still proves every defender reply, not just the AI's.
          Line length sets the depth budget — three attacker moves =
          mate-in-3.
        </p>
        <SolutionRecorder
          snapshot={snapshot}
          value={attackerLine}
          onChange={setAttackerLine}
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
