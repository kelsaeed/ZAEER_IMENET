'use client';
import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode, createElement } from 'react';
import { THEMES, DEFAULT_THEME_ID, Theme, CustomThemeColors, DEFAULT_CUSTOM_COLORS, buildCustomTheme } from '@/game/themes';
import { LOCALES, DEFAULT_LOCALE_ID, Locale, builtInLocale, builtInLocaleIds } from '@/game/locales';

const THEME_KEY = 'zaeer-imenet-theme';
const CUSTOM_COLORS_KEY = 'zaeer-imenet-custom-colors';
const LOCALE_KEY = 'zaeer-imenet-locale';
const CUSTOM_LOCALES_KEY = 'zaeer-imenet-custom-locales';
const TRANSLATION_OVERRIDES_KEY = 'zaeer-imenet-translation-overrides';

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
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setThemeIdState(localStorage.getItem(THEME_KEY) || DEFAULT_THEME_ID);
    setCustomColors(readJSON<CustomThemeColors>(CUSTOM_COLORS_KEY, DEFAULT_CUSTOM_COLORS));
    setLocaleIdState(localStorage.getItem(LOCALE_KEY) || DEFAULT_LOCALE_ID);
    setCustomLocales(readJSON<Locale[]>(CUSTOM_LOCALES_KEY, []));
    setOverrides(readJSON<Overrides>(TRANSLATION_OVERRIDES_KEY, {}));
    setHydrated(true);
  }, []);

  // Persist
  useEffect(() => { if (hydrated) localStorage.setItem(THEME_KEY, themeId); }, [themeId, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(customColors)); }, [customColors, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(LOCALE_KEY, localeId); }, [localeId, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(CUSTOM_LOCALES_KEY, JSON.stringify(customLocales)); }, [customLocales, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(TRANSLATION_OVERRIDES_KEY, JSON.stringify(overrides)); }, [overrides, hydrated]);

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

  const addCustomLocale = useCallback((id: string, name: string, flag: string, baseId = 'en', dir: 'ltr' | 'rtl' = 'ltr') => {
    setCustomLocales(prev => {
      if (prev.some(l => l.id === id) || builtInLocaleIds().includes(id)) return prev;
      const base = builtInLocale(baseId) ?? builtInLocale('en')!;
      return [...prev, { id, name, flag, dir, strings: { ...base.strings } }];
    });
  }, []);

  const removeCustomLocale = useCallback((id: string) => {
    if (builtInLocaleIds().includes(id)) return;
    setCustomLocales(prev => prev.filter(l => l.id !== id));
    setOverrides(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setLocaleIdState(prev => (prev === id ? DEFAULT_LOCALE_ID : prev));
  }, []);

  const setTranslation = useCallback((targetLocaleId: string, key: string, value: string) => {
    setOverrides(prev => ({
      ...prev,
      [targetLocaleId]: { ...(prev[targetLocaleId] ?? {}), [key]: value },
    }));
  }, []);

  const resetTranslation = useCallback((targetLocaleId: string, key: string) => {
    setOverrides(prev => {
      const cur = prev[targetLocaleId];
      if (!cur || !(key in cur)) return prev;
      const next = { ...cur };
      delete next[key];
      return { ...prev, [targetLocaleId]: next };
    });
  }, []);

  const isBuiltIn = useCallback((id: string) => builtInLocaleIds().includes(id), []);

  const value: SettingsValue = {
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
  };

  return createElement(Ctx.Provider, { value }, children);
}

export function useSettings(): SettingsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings must be used within SettingsProvider');
  return v;
}
