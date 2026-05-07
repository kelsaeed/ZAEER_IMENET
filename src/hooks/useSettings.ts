'use client';
import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode, createElement } from 'react';
import { THEMES, DEFAULT_THEME_ID, Theme, CustomThemeColors, DEFAULT_CUSTOM_COLORS, buildCustomTheme } from '@/game/themes';
import { LOCALES, DEFAULT_LOCALE_ID, Locale, builtInLocale, builtInLocaleIds } from '@/game/locales';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import {
  listAppLocales, listOverrides,
  addAppLocale, removeAppLocale,
  upsertOverride, deleteOverride,
} from '@/lib/supabase/locales';

// Personal preferences stay in localStorage (theme, language pick, custom
// theme colours). Custom locales and translation overrides moved to the
// database — they're system-wide content edited by an admin.
const THEME_KEY = 'zaeer-imenet-theme';
const CUSTOM_COLORS_KEY = 'zaeer-imenet-custom-colors';
const LOCALE_KEY = 'zaeer-imenet-locale';
// Audio + haptics prefs. SFX defaults on (the cue is information, not
// noise). Music defaults off — there's no track shipping yet, so leaving
// it on would just be the user toggling a thing that does nothing.
// Haptics default on; navigator.vibrate is a no-op on devices that don't
// support it, so the default doesn't punish anyone.
const SFX_KEY = 'zaeer-imenet-sfx';
const MUSIC_KEY = 'zaeer-imenet-music';
const HAPTICS_KEY = 'zaeer-imenet-haptics';

type Overrides = Record<string, Record<string, string>>; // localeId → key → value

interface SettingsValue {
  // Theme
  theme: Theme;
  themeId: string;
  setThemeId: (id: string) => void;
  themes: Theme[];
  // Custom theme (only used when themeId === 'custom')
  customColors: CustomThemeColors;
  setCustomColor: (key: keyof CustomThemeColors, value: string) => void;
  resetCustomColors: () => void;
  // Locale
  locale: Locale;
  localeId: string;
  setLocaleId: (id: string) => void;
  locales: Locale[];
  isRTL: boolean;
  // Translation
  t: (key: string) => string;
  // Admin: custom locales & translation overrides
  addCustomLocale: (id: string, name: string, flag: string, baseId?: string, dir?: 'ltr' | 'rtl') => void;
  removeCustomLocale: (id: string) => void;
  setTranslation: (localeId: string, key: string, value: string) => void;
  resetTranslation: (localeId: string, key: string) => void;
  isBuiltIn: (id: string) => boolean;
  // Audio + haptics
  soundEnabled: boolean;
  setSoundEnabled: (next: boolean) => void;
  musicEnabled: boolean;
  setMusicEnabled: (next: boolean) => void;
  hapticsEnabled: boolean;
  setHapticsEnabled: (next: boolean) => void;
}

const Ctx = createContext<SettingsValue | null>(null);

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>(DEFAULT_THEME_ID);
  const [customColors, setCustomColors] = useState<CustomThemeColors>(DEFAULT_CUSTOM_COLORS);
  const [localeId, setLocaleIdState] = useState<string>(DEFAULT_LOCALE_ID);
  const [customLocales, setCustomLocales] = useState<Locale[]>([]);
  const [overrides, setOverrides] = useState<Overrides>({});
  // Audio prefs default to true (sound) / false (music) / true (haptics).
  // See the storage-key block above for the rationale.
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(true);
  const [musicEnabled, setMusicEnabledState] = useState<boolean>(false);
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(true);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate personal prefs from localStorage on mount. The profile-side
  // theme sync is layered on top by ThemeProfileSync below — settings
  // itself doesn't depend on the user context so we don't introduce a
  // hard ordering between SettingsProvider and UserProvider.
  useEffect(() => {
    setThemeIdState(localStorage.getItem(THEME_KEY) || DEFAULT_THEME_ID);
    setCustomColors(readJSON<CustomThemeColors>(CUSTOM_COLORS_KEY, DEFAULT_CUSTOM_COLORS));
    setLocaleIdState(localStorage.getItem(LOCALE_KEY) || DEFAULT_LOCALE_ID);
    // localStorage stores strings; treat anything other than '0' as on so
    // we never reach a "user toggled it on but it stuck off" state from
    // a missing key after a fresh install.
    const sfxRaw = localStorage.getItem(SFX_KEY);
    if (sfxRaw !== null) setSoundEnabledState(sfxRaw !== '0');
    const musicRaw = localStorage.getItem(MUSIC_KEY);
    if (musicRaw !== null) setMusicEnabledState(musicRaw === '1');
    const hapRaw = localStorage.getItem(HAPTICS_KEY);
    if (hapRaw !== null) setHapticsEnabledState(hapRaw !== '0');
    setHydrated(true);
  }, []);

  // Persist personal prefs back to localStorage. (Custom locales and
  // overrides are NOT persisted here anymore — they live in Supabase.)
  useEffect(() => { if (hydrated) localStorage.setItem(THEME_KEY, themeId); }, [themeId, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(customColors)); }, [customColors, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(LOCALE_KEY, localeId); }, [localeId, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(SFX_KEY, soundEnabled ? '1' : '0'); }, [soundEnabled, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(MUSIC_KEY, musicEnabled ? '1' : '0'); }, [musicEnabled, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(HAPTICS_KEY, hapticsEnabled ? '1' : '0'); }, [hapticsEnabled, hydrated]);

  // ── Hydrate shared content from the database ────────────────────────────
  // Custom locales and translation overrides are admin-edited and visible
  // to every player. We pull them on mount and subscribe to Realtime so
  // edits propagate live.
  const refreshFromDb = useCallback(async () => {
    const [rows, ovRows] = await Promise.all([listAppLocales(), listOverrides()]);
    const locs: Locale[] = rows.map(r => {
      const base = builtInLocale(r.base_id) ?? builtInLocale('en')!;
      return {
        id: r.id,
        name: r.name,
        flag: r.flag,
        dir: r.dir,
        // Start from the base locale's strings; overrides apply on top via t().
        strings: { ...base.strings },
      };
    });
    const ov: Overrides = {};
    for (const o of ovRows) {
      if (!ov[o.locale_id]) ov[o.locale_id] = {};
      ov[o.locale_id][o.key] = o.value;
    }
    setCustomLocales(locs);
    setOverrides(ov);
  }, []);

  useEffect(() => {
    void refreshFromDb();
    const supabase = getSupabaseBrowser();
    const channel = supabase
      .channel('app-locales-overrides')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'app_locales' },
        () => { void refreshFromDb(); })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'app_translation_overrides' },
        () => { void refreshFromDb(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refreshFromDb]);

  const allLocales = useMemo(() => [...LOCALES, ...customLocales], [customLocales]);
  const builtTheme = useMemo(() => THEMES.find(t => t.id === themeId) ?? THEMES[0], [themeId]);
  const customTheme = useMemo(() => buildCustomTheme(customColors), [customColors]);
  const theme = themeId === 'custom' ? customTheme : builtTheme;
  const locale = useMemo(() => allLocales.find(l => l.id === localeId) ?? allLocales[0], [allLocales, localeId]);

  const t = useCallback((key: string): string => {
    // 1. user override for this locale wins
    const ov = overrides[locale.id]?.[key];
    if (ov !== undefined) return ov;
    // 2. translation defined in the locale itself
    if (locale.strings[key] !== undefined) return locale.strings[key];
    // 3. fall back to English
    const en = builtInLocale('en');
    if (en?.strings[key] !== undefined) return en.strings[key];
    // 4. last resort: the key itself
    return key;
  }, [locale, overrides]);

  const setThemeId = useCallback((id: string) => setThemeIdState(id), []);
  const setLocaleId = useCallback((id: string) => setLocaleIdState(id), []);

  const setCustomColor = useCallback((key: keyof CustomThemeColors, value: string) => {
    setCustomColors(prev => ({ ...prev, [key]: value }));
  }, []);
  const resetCustomColors = useCallback(() => setCustomColors(DEFAULT_CUSTOM_COLORS), []);

  // Add/remove a custom locale. RLS rejects writes from non-admins; we
  // apply the change locally first so the admin sees instant feedback,
  // then let the Realtime fan-out reconcile every other connected client.
  const addCustomLocale = useCallback((id: string, name: string, flag: string, baseId = 'en', dir: 'ltr' | 'rtl' = 'ltr') => {
    if (builtInLocaleIds().includes(id)) return;
    const base = builtInLocale(baseId) ?? builtInLocale('en')!;
    setCustomLocales(prev =>
      prev.some(l => l.id === id) ? prev : [...prev, { id, name, flag, dir, strings: { ...base.strings } }],
    );
    void addAppLocale({ id, name, flag, base_id: baseId, dir }).catch(err => {
      // Roll back the optimistic insert on error.
      setCustomLocales(prev => prev.filter(l => l.id !== id));
      console.error('[settings] addAppLocale rejected (admin only):', err);
    });
  }, []);

  const removeCustomLocale = useCallback((id: string) => {
    if (builtInLocaleIds().includes(id)) return;
    const before = customLocales;
    setCustomLocales(prev => prev.filter(l => l.id !== id));
    setOverrides(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setLocaleIdState(prev => (prev === id ? DEFAULT_LOCALE_ID : prev));
    void removeAppLocale(id).catch(err => {
      // Roll back if the DB rejected the delete (non-admin caller).
      setCustomLocales(before);
      console.error('[settings] removeAppLocale rejected (admin only):', err);
    });
  }, [customLocales]);

  const setTranslation = useCallback((targetLocaleId: string, key: string, value: string) => {
    setOverrides(prev => ({
      ...prev,
      [targetLocaleId]: { ...(prev[targetLocaleId] ?? {}), [key]: value },
    }));
    void upsertOverride(targetLocaleId, key, value).catch(err => {
      console.error('[settings] upsertOverride rejected (admin only):', err);
    });
  }, []);

  const resetTranslation = useCallback((targetLocaleId: string, key: string) => {
    setOverrides(prev => {
      const cur = prev[targetLocaleId];
      if (!cur || !(key in cur)) return prev;
      const next = { ...cur };
      delete next[key];
      return { ...prev, [targetLocaleId]: next };
    });
    void deleteOverride(targetLocaleId, key).catch(err => {
      console.error('[settings] deleteOverride rejected (admin only):', err);
    });
  }, []);

  const isBuiltIn = useCallback((id: string) => builtInLocaleIds().includes(id), []);

  const setSoundEnabled = useCallback((next: boolean) => setSoundEnabledState(next), []);
  const setMusicEnabled = useCallback((next: boolean) => setMusicEnabledState(next), []);
  const setHapticsEnabled = useCallback((next: boolean) => setHapticsEnabledState(next), []);

  // Memoize the context value. Without this, every render of SettingsProvider
  // produces a fresh `value` object reference, which forces every consumer of
  // useSettings to re-render — and the GameBoard alone has 256 cells calling
  // useSettings inside React.memo. That single missed memo was the dominant
  // cause of resize / zoom jank.
  const value = useMemo<SettingsValue>(
    () => ({
      theme,
      themeId,
      setThemeId,
      themes: THEMES,
      customColors,
      setCustomColor,
      resetCustomColors,
      locale,
      localeId: locale.id,
      setLocaleId,
      locales: allLocales,
      isRTL: locale.dir === 'rtl',
      t,
      addCustomLocale,
      removeCustomLocale,
      setTranslation,
      resetTranslation,
      isBuiltIn,
      soundEnabled,
      setSoundEnabled,
      musicEnabled,
      setMusicEnabled,
      hapticsEnabled,
      setHapticsEnabled,
    }),
    [
      theme, themeId, customColors, locale, allLocales, t,
      setThemeId, setCustomColor, resetCustomColors, setLocaleId,
      addCustomLocale, removeCustomLocale, setTranslation, resetTranslation, isBuiltIn,
      soundEnabled, setSoundEnabled,
      musicEnabled, setMusicEnabled,
      hapticsEnabled, setHapticsEnabled,
    ],
  );

  return createElement(Ctx.Provider, { value }, children);
}

export function useSettings(): SettingsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings must be used within SettingsProvider');
  return v;
}

// Re-export the audio pref keys so the rare consumer that wants to read
// them outside of React (e.g. a one-shot click handler that fires a
// cue without subscribing to the context) can do `localStorage.getItem`.
export const AUDIO_STORAGE_KEYS = {
  sfx: SFX_KEY,
  music: MUSIC_KEY,
  haptics: HAPTICS_KEY,
} as const;
