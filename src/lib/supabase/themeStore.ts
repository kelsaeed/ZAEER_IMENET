'use client';
import { getSupabaseBrowser } from './client';
import type { Theme } from '@/game/themes';

/** A row from public.themes_catalog. The id matches the string used
 *  in src/game/themes.ts so the runtime can resolve the actual Theme
 *  object via getThemeById(id). For admin-authored themes, theme_data
 *  carries the full Theme spec inline. */
export interface ThemeCatalogRow {
  id: string;
  display_name: string;
  display_name_ar: string | null;
  description: string | null;
  description_ar: string | null;
  price_cents: number;
  is_published: boolean;
  sort_order: number;
  // v2 fields
  theme_data: Partial<Theme> | null;
  decor_kind: string;
  discount_pct: number;
  discount_ends_at: string | null;
  free_until: string | null;
  is_premium: boolean;
}

export interface ThemeRedeemCodeRow {
  code: string;
  theme_id: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  used_by: string | null;
  used_at: string | null;
  expires_at: string | null;
}

const CATALOG_COLUMNS =
  'id, display_name, display_name_ar, description, description_ar, ' +
  'price_cents, is_published, sort_order, ' +
  'theme_data, decor_kind, discount_pct, discount_ends_at, free_until, is_premium';

/** Public list — works for signed-out browsers too. RLS hides
 *  unpublished rows from non-admins; admins get the full set including
 *  drafts via the admin-read policy. */
export async function listThemeCatalog(): Promise<ThemeCatalogRow[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('themes_catalog')
    .select(CATALOG_COLUMNS)
    .order('sort_order', { ascending: true });
  if (error) return [];
  return (data ?? []) as ThemeCatalogRow[];
}

/** Theme ids the signed-in user owns. Returns [] for signed-out users
 *  since RLS blocks the read. */
export async function listOwnedThemeIds(): Promise<string[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('theme_ownership')
    .select('theme_id');
  if (error) return [];
  return (data ?? []).map((r: { theme_id: string }) => r.theme_id);
}

/** Claim a free theme. Returns true on success (or if already owned).
 *  The RPC honors free_until and 100%-off discounts now, so a "free
 *  until tomorrow" giveaway also goes through this path. */
export async function acquireFreeTheme(themeId: string): Promise<boolean> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.rpc('acquire_free_theme', { p_theme_id: themeId });
  if (error) return false;
  return data === true;
}

/** Redeem a one-time code. Returns true on success. The RPC marks the
 *  code as used and inserts the ownership row in one transaction so
 *  concurrent redemptions can't both succeed. */
export async function redeemThemeCode(code: string): Promise<boolean> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.rpc('redeem_theme_code', { p_code: code.trim() });
  if (error) return false;
  return data === true;
}

// ─── Effective-price helpers (client mirror of the SQL function) ────────

/** Effective price in cents, accounting for free_until and discounts.
 *  Mirrors public.theme_effective_price_cents — kept in sync with the
 *  migration so the UI doesn't have to round-trip every render. */
export function effectivePriceCents(row: ThemeCatalogRow, now: Date = new Date()): number {
  const freeUntil = row.free_until ? new Date(row.free_until) : null;
  if (freeUntil && freeUntil > now) return 0;
  if (row.discount_pct > 0) {
    const ends = row.discount_ends_at ? new Date(row.discount_ends_at) : null;
    if (!ends || ends > now) {
      return Math.max(0, Math.floor((row.price_cents * (100 - row.discount_pct)) / 100));
    }
  }
  return row.price_cents;
}

/** True when the row is currently free (either pinned by free_until
 *  or 100%-off via discount). The /store CTA uses this to decide
 *  between "Get for free" and "Coming soon". */
export function isCurrentlyFree(row: ThemeCatalogRow, now: Date = new Date()): boolean {
  return effectivePriceCents(row, now) === 0;
}

// ─── Admin: catalog CRUD ────────────────────────────────────────────────
// RLS already restricts these to is_admin via the "themes_catalog admin
// write" policy in 0014. We just expose typed helpers; permission
// errors come back through `error.message` for the UI to surface.

export type ThemeCatalogUpsert = Pick<ThemeCatalogRow,
  'id' | 'display_name' | 'display_name_ar' | 'description' | 'description_ar'
  | 'price_cents' | 'is_published' | 'sort_order' | 'theme_data' | 'decor_kind'
  | 'discount_pct' | 'discount_ends_at' | 'free_until' | 'is_premium'
>;

export async function upsertCatalogTheme(row: ThemeCatalogUpsert): Promise<void> {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from('themes_catalog')
    .upsert(row, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function deleteCatalogTheme(id: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase.from('themes_catalog').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Admin: redeem codes ────────────────────────────────────────────────

/** List all redeem codes. RLS blocks non-admins entirely, so this
 *  returns [] for them — no leaks. Optionally filter by theme. */
export async function listRedeemCodes(themeId?: string): Promise<ThemeRedeemCodeRow[]> {
  const supabase = getSupabaseBrowser();
  let q = supabase
    .from('theme_redeem_codes')
    .select('code, theme_id, note, created_by, created_at, used_by, used_at, expires_at')
    .order('created_at', { ascending: false });
  if (themeId) q = q.eq('theme_id', themeId);
  const { data, error } = await q;
  if (error) return [];
  return (data ?? []) as ThemeRedeemCodeRow[];
}

export interface CreateRedeemCodeInput {
  themeId: string;
  /** Optional vanity code. Omit to auto-generate a 12-char code. */
  code?: string;
  note?: string;
  expiresAt?: string | null;
}

/** Generate a new redeem code via the admin RPC. Returns the code on
 *  success — auto-generated if `code` was omitted. */
export async function createRedeemCode(input: CreateRedeemCodeInput): Promise<string> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.rpc('create_theme_redeem_code', {
    p_theme_id: input.themeId,
    p_code: input.code ?? null,
    p_note: input.note ?? null,
    p_expires_at: input.expiresAt ?? null,
  });
  if (error) throw new Error(error.message);
  return String(data ?? '');
}

export async function deleteRedeemCode(code: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase.from('theme_redeem_codes').delete().eq('code', code);
  if (error) throw new Error(error.message);
}
