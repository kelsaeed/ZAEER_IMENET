'use client';
import { useEffect, useRef } from 'react';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { DEFAULT_THEME_ID } from '@/game/themes';

/** Two-way bridge between localStorage-backed `useSettings.themeId` and
 *  `profiles.theme_id` (added in migration 0013). The settings provider
 *  intentionally does NOT depend on user context so it works on the
 *  marketing pages too — this component sits inside the user provider
 *  and reconciles the two whenever they drift.
 *
 *  Reconciliation rules:
 *    1. On first profile load, only ADOPT the server's value if the
 *       local theme is still the default. That prevents an early
 *       sign-in from clobbering a pick the user just made on this
 *       device before they signed in.
 *    2. After that, every local change pushes to the server. Pushes
 *       are also unconditional once the user is signed in — even if
 *       adoption hasn't run yet — so a brand-new install that picks
 *       a theme + signs in still ends up with the right value on the
 *       server.
 *    3. Errors are logged once but never surfaced. Most likely cause
 *       is migration 0013 not being applied yet (the column doesn't
 *       exist); the UI still works fine in that case, it just falls
 *       back to single-theme rendering on the board. */
export default function ThemeProfileSync() {
  const { user, profile } = useUser();
  const { themeId, setThemeId } = useSettings();
  const adoptedRef = useRef(false);
  const lastPushedRef = useRef<string | null>(null);
  const errorLoggedRef = useRef(false);

  // First profile load: pull only if we wouldn't be overwriting a
  // user choice. Local-themeId-still-default is the conservative
  // signal — if the user changed it before sign-in, they had to
  // bump it off the default, so we leave their pick alone.
  useEffect(() => {
    if (adoptedRef.current) return;
    if (!profile) return;
    const remote = profile.theme_id;
    if (remote && remote !== DEFAULT_THEME_ID && themeId === DEFAULT_THEME_ID) {
      setThemeId(remote);
    }
    adoptedRef.current = true;
    lastPushedRef.current = remote ?? null;
  }, [profile, themeId, setThemeId]);

  // Push the local theme to the server whenever it changes (or once
  // we know the user). Gated on user (not on adoption) so a freshly
  // signed-in user immediately syncs their local pick up to the row.
  useEffect(() => {
    if (!user) return;
    if (themeId === lastPushedRef.current) return;
    lastPushedRef.current = themeId;
    const supabase = getSupabaseBrowser();
    void supabase
      .from('profiles')
      .update({ theme_id: themeId })
      .eq('id', user.id)
      .then((res: { error: { message?: string } | null }) => {
        if (res.error && !errorLoggedRef.current) {
          errorLoggedRef.current = true;
          console.warn(
            '[theme] could not save theme to profile —',
            'migration 0013 may not be applied:',
            res.error.message,
          );
        }
      });
  }, [themeId, user]);

  return null;
}
