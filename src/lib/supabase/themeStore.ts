'use client';
import { getSupabaseBrowser } from './client';

/** A single row from public.themes_catalog. The id matches the string
 *  used in src/game/themes.ts so the runtime can resolve the actual
 *  Theme object via getThemeById(id). */
export interface ThemeCatalogRow {
  id: string;
  display_name: string;
  display_name_ar: string | null;
  description: string | null;
  description_ar: string | null;
  price_cents: number;
  is_published: boolean;
  sort_order: number;
}

/** Public list — works for signed-out browsers too. RLS hides
 *  unpublished rows from non-admins, so the result is the storefront. */
export async function listThemeCatalog(): Promise<ThemeCatalogRow[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('themes_catalog')
    .select('id, display_name, display_name_ar, description, description_ar, price_cents, is_published, sort_order')
    .order('sort_order', { ascending: true });
  if (error) return [];
  return (data ?? []) as ThemeCatalogRow[];
}

/** Theme ids the signed-in user owns. Returns [] for signed-out users
 *  since RLS blocks the read. The catalog itself is still visible. */
export async function listOwnedThemeIds(): Promise<string[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('theme_ownership')
    .select('theme_id');
  if (error) return [];
  return (data ?? []).map((r: { theme_id: string }) => r.theme_id);
}

/** Claim a free theme. Returns true on success (or if already owned).
 *  The RPC enforces price_cents = 0 and is_published, so paid themes
 *  always come back as false even if someone tries to call this on one. */
export async function acquireFreeTheme(themeId: string): Promise<boolean> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase.rpc('acquire_free_theme', { p_theme_id: themeId });
  if (error) return false;
  return data === true;
}
