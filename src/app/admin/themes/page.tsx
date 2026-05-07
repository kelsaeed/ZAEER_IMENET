'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSettings } from '@/hooks/useSettings';
import { useUser } from '@/hooks/useUser';
import { THEMES, type Theme } from '@/game/themes';
import {
  listThemeCatalog,
  upsertCatalogTheme,
  deleteCatalogTheme,
  listRedeemCodes,
  createRedeemCode,
  deleteRedeemCode,
  effectivePriceCents,
  type ThemeCatalogRow,
  type ThemeRedeemCodeRow,
  type ThemeCatalogUpsert,
} from '@/lib/supabase/themeStore';

/** Admin-only theme studio. Server-side RLS already blocks every
 *  write from non-admins (themes_catalog "admin write" policy in
 *  0014, theme_redeem_codes "admin all" policy in 0016), so this
 *  page is the friendly UI layer on top. We still bounce non-admins
 *  client-side so they don't see an empty failing form. */
export default function AdminThemesPage() {
  const router = useRouter();
  const { theme, t, isRTL } = useSettings();
  const { user, profile, loading } = useUser();
  const isAdmin = !!profile?.is_admin;

  const [rows, setRows] = useState<ThemeCatalogRow[] | null>(null);
  const [editing, setEditing] = useState<ThemeCatalogRow | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const list = await listThemeCatalog();
    setRows(list);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (!isAdmin) { router.replace('/'); return; }
    void refresh();
  }, [loading, user, isAdmin, router, refresh]);

  if (loading || !isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: theme.bgGradient, color: theme.textPrimary }}>
        <span className="opacity-70 text-sm">{t('admin.themes.loading')}</span>
      </main>
    );
  }

  return (
    <main
      dir={isRTL ? 'rtl' : 'ltr'}
      className="min-h-screen w-full px-4 sm:px-6 py-8 pt-16"
      style={{ minHeight: '100dvh', background: theme.bgGradient, color: theme.textPrimary }}
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <Link
            href="/store"
            className="rounded-full px-3 py-1.5 text-sm font-semibold transition-transform hover:scale-105"
            style={{
              background: theme.panelBg,
              border: `1px solid ${theme.panelBorder}`,
              color: theme.textPrimary,
            }}
          >
            {isRTL ? '→' : '←'} {t('admin.themes.backToStore')}
          </Link>
          <button
            onClick={() => setEditing('new')}
            className="rounded-full px-4 py-2 text-sm font-bold"
            style={{
              background: theme.buttonRotateBg,
              border: `1px solid ${theme.buttonRotateBorder}`,
              color: theme.buttonRotateText,
            }}
          >
            ＋ {t('admin.themes.newTheme')}
          </button>
        </div>
        <h1 className="text-3xl font-extrabold mb-1" style={{ color: theme.p1Color }}>
          🛡️ {t('admin.themes.title')}
        </h1>
        <p className="text-sm mb-6" style={{ color: theme.textMuted }}>
          {t('admin.themes.subtitle')}
        </p>

        {msg && (
          <div
            className="mb-3 rounded-lg px-3 py-2 text-sm"
            style={{
              background: theme.panelBg,
              border: `1px solid ${msg.kind === 'ok' ? theme.p1AccentBorder : theme.buttonEndTurnBorder}`,
              color: msg.kind === 'ok' ? theme.p1Color : theme.buttonEndTurnText,
            }}
          >
            {msg.text}
          </div>
        )}

        {rows === null && (
          <div className="text-center py-12 opacity-70">{t('admin.themes.loading')}</div>
        )}

        {rows !== null && (
          <div className="flex flex-col gap-3">
            {rows.map(row => (
              <RowCard
                key={row.id}
                row={row}
                onEdit={() => setEditing(row)}
                onChanged={refresh}
                setMsg={setMsg}
                setBusy={setBusy}
              />
            ))}
          </div>
        )}
      </div>

      {editing && (
        <ThemeEditor
          initial={editing === 'new' ? null : editing}
          existingIds={(rows ?? []).map(r => r.id)}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
            setMsg({ kind: 'ok', text: t('admin.themes.savedOk') });
          }}
          onError={text => setMsg({ kind: 'err', text })}
          setBusy={setBusy}
        />
      )}
    </main>
  );
}

// ─── Row card ────────────────────────────────────────────────────────────

interface RowCardProps {
  row: ThemeCatalogRow;
  onEdit: () => void;
  onChanged: () => void | Promise<void>;
  setMsg: (m: { kind: 'ok' | 'err'; text: string } | null) => void;
  setBusy: (b: boolean) => void;
}

function RowCard({ row, onEdit, onChanged, setMsg, setBusy }: RowCardProps) {
  const { theme, t, resolveThemeById, setPreviewThemeId, previewThemeId } = useSettings();
  const preview = resolveThemeById(row.id) ?? theme;
  const [codesOpen, setCodesOpen] = useState(false);
  const isPreviewing = previewThemeId === row.id;

  const effective = effectivePriceCents(row);

  async function handleDelete() {
    if (!confirm(t('admin.themes.confirmDelete').replace('{id}', row.id))) return;
    setBusy(true);
    try {
      await deleteCatalogTheme(row.id);
      await onChanged();
      setMsg({ kind: 'ok', text: t('admin.themes.deleted') });
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
    >
      <div className="flex items-center gap-3 p-3 flex-wrap">
        {/* Mini preview */}
        <div
          className="rounded-lg w-24 h-14 shrink-0"
          style={{ background: preview.bgGradient, border: `1px solid ${preview.boardBorder}` }}
        />
        <div className="flex-1 min-w-[10rem]">
          <div className="font-bold flex items-center gap-2">
            {row.display_name}
            {!row.is_published && (
              <span className="text-[10px] rounded-full px-2 py-0.5"
                style={{ background: theme.buttonBg, border: `1px solid ${theme.buttonBorder}`, color: theme.textMuted }}>
                {t('admin.themes.draftPill')}
              </span>
            )}
            {row.is_premium && (
              <span className="text-[10px] rounded-full px-2 py-0.5"
                style={{ background: 'linear-gradient(135deg,#fbbf24,#a78bfa)', color: '#1a0d2e' }}>
                ✦ premium
              </span>
            )}
          </div>
          <div className="text-xs opacity-70 font-mono">{row.id}</div>
          <div className="text-xs mt-0.5" style={{ color: theme.textMuted }}>
            {row.price_cents === 0
              ? t('store.priceFree')
              : `$${(row.price_cents / 100).toFixed(2)}`}
            {effective < row.price_cents && row.price_cents > 0 && (
              <> → <strong>${(effective / 100).toFixed(2)}</strong> ({row.discount_pct}% off)</>
            )}
            {row.free_until && <> · 🎁 free until {new Date(row.free_until).toLocaleDateString()}</>}
            {row.decor_kind !== 'none' && <> · ✨ {row.decor_kind}</>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setPreviewThemeId(isPreviewing ? null : row.id)}
            className="rounded-full px-3 py-1.5 text-xs font-bold"
            style={{
              background: isPreviewing ? theme.p2AccentBg : theme.buttonBg,
              border: `1px solid ${isPreviewing ? theme.p2AccentBorder : theme.buttonBorder}`,
              color: isPreviewing ? theme.p2Color : theme.textPrimary,
            }}
          >
            {isPreviewing ? `✕ ${t('store.previewStop')}` : `👁 ${t('store.previewCta')}`}
          </button>
          <button
            onClick={() => setCodesOpen(o => !o)}
            className="rounded-full px-3 py-1.5 text-xs font-bold"
            style={{
              background: theme.buttonBg,
              border: `1px solid ${theme.buttonBorder}`,
              color: theme.textPrimary,
            }}
          >
            🎟️ {t('admin.themes.codes')}
          </button>
          <button
            onClick={onEdit}
            className="rounded-full px-3 py-1.5 text-xs font-bold"
            style={{
              background: theme.buttonRotateBg,
              border: `1px solid ${theme.buttonRotateBorder}`,
              color: theme.buttonRotateText,
            }}
          >
            ✎ {t('admin.themes.edit')}
          </button>
          <button
            onClick={handleDelete}
            className="rounded-full px-3 py-1.5 text-xs font-bold"
            style={{
              background: theme.buttonEndTurnBg,
              border: `1px solid ${theme.buttonEndTurnBorder}`,
              color: theme.buttonEndTurnText,
            }}
          >
            🗑 {t('admin.themes.delete')}
          </button>
        </div>
      </div>

      {codesOpen && <CodesPanel themeId={row.id} setMsg={setMsg} setBusy={setBusy} />}
    </div>
  );
}

// ─── Codes sub-panel ─────────────────────────────────────────────────────

interface CodesPanelProps {
  themeId: string;
  setMsg: (m: { kind: 'ok' | 'err'; text: string } | null) => void;
  setBusy: (b: boolean) => void;
}

function CodesPanel({ themeId, setMsg, setBusy }: CodesPanelProps) {
  const { theme, t } = useSettings();
  const [codes, setCodes] = useState<ThemeRedeemCodeRow[] | null>(null);
  const [vanity, setVanity] = useState('');
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  const refresh = useCallback(async () => {
    setCodes(await listRedeemCodes(themeId));
  }, [themeId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function handleCreate() {
    setBusy(true);
    try {
      const code = await createRedeemCode({
        themeId,
        code: vanity.trim() || undefined,
        note: note.trim() || undefined,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      setVanity(''); setNote(''); setExpiresAt('');
      await refresh();
      setMsg({ kind: 'ok', text: t('admin.themes.codeCreated').replace('{code}', code) });
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally { setBusy(false); }
  }

  async function handleDelete(code: string) {
    if (!confirm(t('admin.themes.confirmDeleteCode').replace('{code}', code))) return;
    setBusy(true);
    try {
      await deleteRedeemCode(code);
      await refresh();
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <div
      className="border-t p-3"
      style={{ borderColor: theme.panelBorder, background: theme.inputBg }}
    >
      <div className="text-xs font-bold mb-2" style={{ color: theme.textPrimary }}>
        🎟️ {t('admin.themes.codesTitle')}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
        <input
          value={vanity}
          onChange={e => setVanity(e.target.value)}
          placeholder={t('admin.themes.codeVanityHint')}
          className="rounded-md px-2 py-1.5 text-sm font-mono"
          style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}`, color: theme.inputText }}
        />
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={t('admin.themes.codeNoteHint')}
          className="rounded-md px-2 py-1.5 text-sm"
          style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}`, color: theme.inputText }}
        />
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={e => setExpiresAt(e.target.value)}
          className="rounded-md px-2 py-1.5 text-sm"
          style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}`, color: theme.inputText }}
        />
      </div>
      <button
        onClick={handleCreate}
        className="rounded-md px-3 py-1.5 text-xs font-bold"
        style={{
          background: theme.buttonRotateBg,
          border: `1px solid ${theme.buttonRotateBorder}`,
          color: theme.buttonRotateText,
        }}
      >
        ＋ {t('admin.themes.generateCode')}
      </button>
      <div className="mt-3 flex flex-col gap-1.5 max-h-72 overflow-y-auto">
        {codes === null && <span className="text-xs opacity-60">{t('admin.themes.loading')}</span>}
        {codes && codes.length === 0 && <span className="text-xs opacity-60">{t('admin.themes.noCodes')}</span>}
        {codes && codes.map(c => (
          <div
            key={c.code}
            className="rounded-md px-2 py-1.5 text-xs flex items-center gap-2 flex-wrap"
            style={{ background: theme.panelBg, border: `1px solid ${theme.buttonBorder}` }}
          >
            <button
              onClick={() => navigator.clipboard?.writeText(c.code)}
              className="font-mono font-bold tracking-wider"
              style={{ color: c.used_by ? theme.textMuted : theme.p1Color }}
              title={t('admin.themes.copy')}
            >
              {c.code}
            </button>
            {c.note && <span className="opacity-70">— {c.note}</span>}
            <span className="ms-auto opacity-60">
              {c.used_by ? t('admin.themes.used') : c.expires_at && new Date(c.expires_at) < new Date() ? t('admin.themes.expired') : t('admin.themes.fresh')}
            </span>
            <button
              onClick={() => handleDelete(c.code)}
              className="opacity-70 hover:opacity-100"
              title={t('admin.themes.delete')}
            >
              🗑
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Editor modal ────────────────────────────────────────────────────────

interface EditorProps {
  initial: ThemeCatalogRow | null;
  existingIds: string[];
  busy: boolean;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  onError: (text: string) => void;
  setBusy: (b: boolean) => void;
}

function ThemeEditor({ initial, existingIds, onCancel, onSaved, onError, setBusy }: EditorProps) {
  const { theme, t } = useSettings();

  // Pull a complete starter theme spec the admin can tweak. Default to
  // navy when creating a new theme so they get every field pre-filled
  // and only have to override what they care about.
  const starterSpec = useMemo<Theme>(() => initial?.theme_data
    ? { ...THEMES[0], ...initial.theme_data, id: initial.id, name: initial.display_name } as Theme
    : THEMES[0],
    [initial]);

  const [id, setId] = useState(initial?.id ?? '');
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '');
  const [displayNameAr, setDisplayNameAr] = useState(initial?.display_name_ar ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [descriptionAr, setDescriptionAr] = useState(initial?.description_ar ?? '');
  const [priceCents, setPriceCents] = useState(initial?.price_cents ?? 0);
  const [discountPct, setDiscountPct] = useState(initial?.discount_pct ?? 0);
  const [discountEndsAt, setDiscountEndsAt] = useState(initial?.discount_ends_at?.slice(0, 16) ?? '');
  const [freeUntil, setFreeUntil] = useState(initial?.free_until?.slice(0, 16) ?? '');
  const [decorKind, setDecorKind] = useState(initial?.decor_kind ?? 'none');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 100);
  const [isPublished, setIsPublished] = useState(initial?.is_published ?? true);
  const [isPremium, setIsPremium] = useState(initial?.is_premium ?? false);

  // The theme_data textarea. Shows the resolved (post-merge) spec so an
  // admin editing a built-in theme starts from its actual values rather
  // than `null`. On save, we parse + only persist if non-empty / valid.
  const [themeJson, setThemeJson] = useState(() =>
    JSON.stringify(initial?.theme_data ?? starterSpec, null, 2)
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  function loadStarter(starterId: string) {
    const t2 = THEMES.find(x => x.id === starterId);
    if (!t2) return;
    setThemeJson(JSON.stringify(t2, null, 2));
    setJsonError(null);
  }

  async function handleSave() {
    setJsonError(null);
    let parsed: Partial<Theme> | null = null;
    if (themeJson.trim()) {
      try {
        parsed = JSON.parse(themeJson) as Partial<Theme>;
      } catch (e) {
        setJsonError((e as Error).message);
        return;
      }
    }
    if (!id.trim()) { onError(t('admin.themes.errIdRequired')); return; }
    if (!displayName.trim()) { onError(t('admin.themes.errNameRequired')); return; }
    if (!initial && existingIds.includes(id.trim())) {
      onError(t('admin.themes.errIdTaken')); return;
    }

    const row: ThemeCatalogUpsert = {
      id: id.trim(),
      display_name: displayName.trim(),
      display_name_ar: displayNameAr.trim() || null,
      description: description.trim() || null,
      description_ar: descriptionAr.trim() || null,
      price_cents: Math.max(0, Math.floor(priceCents)),
      sort_order: Math.floor(sortOrder),
      is_published: isPublished,
      is_premium: isPremium,
      theme_data: parsed,
      decor_kind: decorKind,
      discount_pct: Math.max(0, Math.min(100, Math.floor(discountPct))),
      discount_ends_at: discountEndsAt ? new Date(discountEndsAt).toISOString() : null,
      free_until: freeUntil ? new Date(freeUntil).toISOString() : null,
    };
    setBusy(true);
    try {
      await upsertCatalogTheme(row);
      await onSaved();
    } catch (e) {
      onError((e as Error).message);
    } finally { setBusy(false); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
        style={{ background: theme.bgGradient, border: `1px solid ${theme.panelBorder}` }}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: theme.panelBorder }}>
          <h2 className="text-lg font-bold" style={{ color: theme.p1Color }}>
            {initial ? t('admin.themes.edit') : t('admin.themes.newTheme')}
          </h2>
          <button onClick={onCancel} className="rounded-md px-2 py-1 text-xs"
            style={{ background: theme.buttonBg, border: `1px solid ${theme.buttonBorder}`, color: theme.textPrimary }}>
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          <Field label={t('admin.themes.fId')}>
            <input value={id} onChange={e => setId(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
              disabled={!!initial}
              placeholder="navy_dawn" className={inputCls(theme)} style={inputStyle(theme)} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('admin.themes.fName')}>
              <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                className={inputCls(theme)} style={inputStyle(theme)} />
            </Field>
            <Field label={t('admin.themes.fNameAr')}>
              <input value={displayNameAr} onChange={e => setDisplayNameAr(e.target.value)} dir="rtl"
                className={inputCls(theme)} style={inputStyle(theme)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('admin.themes.fDesc')}>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                className={inputCls(theme)} style={inputStyle(theme)} />
            </Field>
            <Field label={t('admin.themes.fDescAr')}>
              <textarea value={descriptionAr} onChange={e => setDescriptionAr(e.target.value)} rows={2} dir="rtl"
                className={inputCls(theme)} style={inputStyle(theme)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label={t('admin.themes.fPriceCents')}>
              <input type="number" min={0} value={priceCents} onChange={e => setPriceCents(Number(e.target.value))}
                className={inputCls(theme)} style={inputStyle(theme)} />
            </Field>
            <Field label={t('admin.themes.fDiscount')}>
              <input type="number" min={0} max={100} value={discountPct} onChange={e => setDiscountPct(Number(e.target.value))}
                className={inputCls(theme)} style={inputStyle(theme)} />
            </Field>
            <Field label={t('admin.themes.fSort')}>
              <input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))}
                className={inputCls(theme)} style={inputStyle(theme)} />
            </Field>
            <Field label={t('admin.themes.fDecor')}>
              <select value={decorKind} onChange={e => setDecorKind(e.target.value)}
                className={inputCls(theme)} style={inputStyle(theme)}>
                <option value="none" style={{ background: theme.inputBg, color: theme.inputText }}>none</option>
                <option value="celestial" style={{ background: theme.inputBg, color: theme.inputText }}>celestial</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('admin.themes.fDiscountEnds')}>
              <input type="datetime-local" value={discountEndsAt} onChange={e => setDiscountEndsAt(e.target.value)}
                className={inputCls(theme)} style={inputStyle(theme)} />
            </Field>
            <Field label={t('admin.themes.fFreeUntil')}>
              <input type="datetime-local" value={freeUntil} onChange={e => setFreeUntil(e.target.value)}
                className={inputCls(theme)} style={inputStyle(theme)} />
            </Field>
          </div>
          <div className="flex gap-3 flex-wrap">
            <label className="text-sm flex items-center gap-2" style={{ color: theme.textPrimary }}>
              <input type="checkbox" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} />
              {t('admin.themes.fPublished')}
            </label>
            <label className="text-sm flex items-center gap-2" style={{ color: theme.textPrimary }}>
              <input type="checkbox" checked={isPremium} onChange={e => setIsPremium(e.target.checked)} />
              {t('admin.themes.fPremium')}
            </label>
          </div>
          <Field label={t('admin.themes.fJson')}>
            <div className="flex flex-wrap gap-2 mb-1">
              <span className="text-xs opacity-70">{t('admin.themes.starterFrom')}:</span>
              {THEMES.map(th => (
                <button key={th.id} type="button" onClick={() => loadStarter(th.id)}
                  className="text-xs rounded-md px-2 py-0.5"
                  style={{ background: theme.buttonBg, border: `1px solid ${theme.buttonBorder}`, color: theme.textPrimary }}>
                  {th.name}
                </button>
              ))}
            </div>
            <textarea
              value={themeJson}
              onChange={e => setThemeJson(e.target.value)}
              rows={14}
              className={inputCls(theme) + ' font-mono text-xs'}
              style={inputStyle(theme)}
              spellCheck={false}
            />
            {jsonError && (
              <div className="text-xs mt-1" style={{ color: theme.buttonEndTurnText }}>
                {t('admin.themes.errJson')}: {jsonError}
              </div>
            )}
            <div className="text-xs mt-1 opacity-70">{t('admin.themes.jsonHint')}</div>
          </Field>
        </div>
        <div className="flex justify-end gap-2 p-3 border-t" style={{ borderColor: theme.panelBorder }}>
          <button onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm"
            style={{ background: theme.buttonBg, border: `1px solid ${theme.buttonBorder}`, color: theme.textPrimary }}>
            {t('admin.themes.cancel')}
          </button>
          <button onClick={handleSave} className="rounded-md px-3 py-1.5 text-sm font-bold"
            style={{
              background: theme.buttonRotateBg,
              border: `1px solid ${theme.buttonRotateBorder}`,
              color: theme.buttonRotateText,
            }}>
            💾 {t('admin.themes.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useSettings();
  return (
    <label className="flex flex-col gap-1 text-sm" style={{ color: theme.textPrimary }}>
      <span className="text-xs font-semibold opacity-80">{label}</span>
      {children}
    </label>
  );
}

function inputCls(_theme: Theme): string {
  // Class name only — the inline `style` is wired below via a sibling
  // helper so input bg/border/text colour reacts to the active theme.
  return 'rounded-md px-2 py-1.5 text-sm w-full';
}
function inputStyle(theme: Theme): React.CSSProperties {
  return {
    background: theme.inputBg,
    border: `1px solid ${theme.buttonBorder}`,
    color: theme.inputText,
    outline: 'none',
  };
}
