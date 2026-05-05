'use client';
import { getSupabaseBrowser } from './client';

export interface AppLocaleRow {
  id: string;
  name: string;
  flag: string;
  base_id: string;
  dir: 'ltr' | 'rtl';
}

export interface OverrideRow {
  locale_id: string;
  key: string;
  value: string;
}

/** All admin-defined custom locales. Built-in locales (en, ar) are NOT
 *  in this list — they live in `src/game/locales.ts` and are merged on
 *  top of these in useSettings. */
export async function listAppLocales(): Promise<AppLocaleRow[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('app_locales')
    .select('id, name, flag, base_id, dir');
  if (error) return [];
  return (data ?? []) as AppLocaleRow[];
}

/** Every translation override stored in the DB, regardless of locale. The
 *  caller groups these by locale_id when applying them. */
export async function listOverrides(): Promise<OverrideRow[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from('app_translation_overrides')
    .select('locale_id, key, value');
  if (error) return [];
  return (data ?? []) as OverrideRow[];
}

/** Add a new custom locale. RLS rejects this for non-admin callers. */
export async function addAppLocale(input: AppLocaleRow): Promise<void> {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase.from('app_locales').insert(input);
  if (error) throw new Error(error.message);
}

/** Remove a custom locale (and any overrides keyed to it). Admin only. */
export async function removeAppLocale(id: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  // Drop overrides first so the foreign-keyless cascade is explicit.
  await supabase.from('app_translation_overrides').delete().eq('locale_id', id);
  const { error } = await supabase.from('app_locales').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Set or update a single (locale, key) → value mapping. Admin only. */
export async function upsertOverride(localeId: string, key: string, value: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from('app_translation_overrides')
    .upsert(
      { locale_id: localeId, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'locale_id,key' },
    );
  if (error) throw new Error(error.message);
}

/** Remove an override so the locale's static string (or English fallback)
 *  takes over again. Admin only. */
export async function deleteOverride(localeId: string, key: string): Promise<void> {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from('app_translation_overrides')
    .delete()
    .eq('locale_id', localeId)
    .eq('key', key);
  if (error) throw new Error(error.message);
}
