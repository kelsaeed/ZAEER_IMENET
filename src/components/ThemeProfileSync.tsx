'use client';
import { useEffect, useRef } from 'react';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { getSupabaseBrowser } from '@/lib/supabase/client';

/** Two-way bridge between localStorage-backed `useSettings.themeId` and
 *  `profiles.theme_id` (added in migration 0013). The settings provider
 *  intentionally does NOT depend on user context so it works on the
 *  marketing pages too — this component sits inside the user provider
 *  and reconciles the two whenever they drift.
 *
 *  Strategy:
 *    1. First time profile loads, ADOPT the server's value into local
 *       state (so signing in on a fresh device picks up the cosmetic
 *       you bought / chose elsewhere).
 *    2. After that, every local change pushes to the server. Updates
 *       are best-effort — if the network drops, the local pref still
 *       works, we just lose cross-device sync until the next push. */
export default function ThemeProfileSync() {
  const { user, profile } = useUser();
  const { themeId, setThemeId } = useSettings();
  const adoptedRef = useRef(false);
  const lastPushedRef = useRef<string | null>(null);

  // Pull on first profile load.
  useEffect(() => {
    if (adoptedRef.current) return;
    if (!profile) return;
    const remote = profile.theme_id;
    if (remote && remote !== themeId) {
      setThemeId(remote);
    }
    adoptedRef.current = true;
    lastPushedRef.current = remote ?? null;
  }, [profile, themeId, setThemeId]);

  // Push subsequent local changes.
  useEffect(() => {
    if (!user || !adoptedRef.current) return;
    if (themeId === lastPushedRef.current) return;
    lastPushedRef.current = themeId;
    const supabase = getSupabaseBrowser();
    void supabase
      .from('profiles')
      .update({ theme_id: themeId })
      .eq('id', user.id);
  }, [themeId, user]);

  return null;
}
