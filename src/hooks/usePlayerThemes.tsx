'use client';
import { createContext, useContext, useMemo, type ReactNode, createElement } from 'react';
import { getThemeById, type Theme } from '@/game/themes';
import { useSettings } from './useSettings';

/** Resolved per-player theme objects. Both fields are always populated
 *  — split-board rendering should never have to deal with a null
 *  theme. The `viewer` field carries the local user's currently-active
 *  theme for HUD chrome that doesn't split (panels, buttons, the
 *  settings panel itself). */
export interface PlayerThemes {
  p1: Theme;
  p2: Theme;
  viewer: Theme;
}

const Ctx = createContext<PlayerThemes | null>(null);

interface ProviderProps {
  /** Theme id for player 1. Falls back to the local viewer's theme
   *  when undefined — useful for offline modes (vs AI / pass-and-play)
   *  where there's only one user. */
  p1ThemeId?: string | null;
  /** Theme id for player 2. Same fallback rule. */
  p2ThemeId?: string | null;
  children: ReactNode;
}

/** Wraps any subtree that needs the split board theming. Resolves theme
 *  ids into full Theme objects against the built-in registry; unknown
 *  ids (e.g. 'custom', or one a future migration adds we don't ship in
 *  the bundle yet) fall back to the local viewer's theme so we never
 *  paint a black void. */
export function PlayerThemesProvider({ p1ThemeId, p2ThemeId, children }: ProviderProps) {
  const { theme: viewerTheme } = useSettings();
  const value = useMemo<PlayerThemes>(() => {
    const p1 = getThemeById(p1ThemeId) ?? viewerTheme;
    const p2 = getThemeById(p2ThemeId) ?? viewerTheme;
    return { p1, p2, viewer: viewerTheme };
  }, [p1ThemeId, p2ThemeId, viewerTheme]);
  return createElement(Ctx.Provider, { value }, children);
}

/** Read the resolved per-player themes. When called outside a provider
 *  the whole match-board view is single-themed — we return the
 *  viewer's theme for both slots so existing single-theme call sites
 *  keep working as-is. */
export function usePlayerThemes(): PlayerThemes {
  const ctx = useContext(Ctx);
  const { theme } = useSettings();
  if (ctx) return ctx;
  return { p1: theme, p2: theme, viewer: theme };
}

/** Pick the theme owning a given board row. The split runs along the
 *  natural board midline: rows 0-7 are player 2's territory (top half
 *  of the board, where their pieces start), rows 8-15 are player 1's.
 *  Throne cells (rows 7-8, cols 7-8) straddle the line — we side them
 *  with whichever territory their row belongs to so the throne reads
 *  as half-and-half rather than one side dominating it. */
export function themeForRow(themes: PlayerThemes, row: number): Theme {
  return row < 8 ? themes.p2 : themes.p1;
}
