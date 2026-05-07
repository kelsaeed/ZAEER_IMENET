'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  ReactNode,
  createElement,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { listOwnedThemeIds } from '@/lib/supabase/themeStore';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  is_admin: boolean;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  // Daily-puzzle streak counters (added in migration 0011). Optional so
  // the type still loads against an unmigrated database without throwing
  // — they read as undefined and the UI defaults to 0.
  puzzle_current_streak?: number;
  puzzle_best_streak?: number;
  puzzle_last_solved_date?: string | null;
  // Visual theme the player picked (added in migration 0013). Drives
  // the per-player split board theming. Optional so unmigrated DBs
  // still load — consumers fall back to the default theme id.
  theme_id?: string;
}

interface UserState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Theme ids the user owns (from public.theme_ownership). Empty set
   *  for signed-out users — RLS hides the table. The /store page and
   *  the SettingsPanel theme picker both read this to gate locked
   *  themes; the store page calls reloadOwnership() after a claim. */
  ownedThemeIds: Set<string>;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
  reloadOwnership: () => Promise<void>;
}

const UserCtx = createContext<UserState | null>(null);

/** App-wide auth provider. Mount once, near the root, so the user state
 *  persists across React re-renders and conditional render branches.
 *  Without this, each <AuthBadge> instance had its own `loading -> user`
 *  cycle and could briefly flash a "Sign in" button after a phase change. */
export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ownedThemeIds, setOwnedThemeIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) {
        setProfile(null);
        return;
      }
      setProfile((data as Profile | null) ?? null);
    } catch {
      setProfile(null);
    }
  }, []);

  const loadOwnership = useCallback(async () => {
    // Returns [] for signed-out users — RLS blocks the read. We still
    // call it so the state always reflects the server (e.g. after a
    // sign-out we drop any stale ids from the previous session).
    try {
      const ids = await listOwnedThemeIds();
      setOwnedThemeIds(new Set(ids));
    } catch {
      setOwnedThemeIds(new Set());
    }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let mounted = true;

    // Safety net: never leave the UI stuck on a loading spinner forever.
    const safetyTimeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    // Resolve the session FIRST and clear loading immediately so the badge
    // shows up instantly. The profile fetch (a separate network request)
    // runs in the background and updates the avatar/display name when it
    // arrives — non-blocking. Previously we awaited the profile and any
    // ~300-800ms latency to the profiles table delayed the entire UI.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      clearTimeout(safetyTimeout);
      setLoading(false);
      if (data.session?.user) {
        // Fire-and-forget: profile state will fill in once it arrives.
        void loadProfile(data.session.user.id);
        void loadOwnership();
      }
    }).catch(() => {
      if (mounted) {
        clearTimeout(safetyTimeout);
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        void loadProfile(session.user.id);
        void loadOwnership();
      } else {
        setProfile(null);
        setOwnedThemeIds(new Set());
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      sub.subscription.unsubscribe();
    };
  }, [loadProfile, loadOwnership]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    // Wipe local state FIRST so the UI updates immediately even if the
    // network call to Supabase is slow or fails.
    setUser(null);
    setProfile(null);
    setOwnedThemeIds(new Set());
    try {
      await supabase.auth.signOut();
    } catch {
      // If signOut throws (network down, expired token), local state is
      // already cleared above so the user appears signed out anyway.
    }
  }, []);

  const reloadProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  const reloadOwnership = useCallback(async () => {
    await loadOwnership();
  }, [loadOwnership]);

  const value = useMemo<UserState>(
    () => ({ user, profile, loading, ownedThemeIds, signOut, reloadProfile, reloadOwnership }),
    [user, profile, loading, ownedThemeIds, signOut, reloadProfile, reloadOwnership],
  );

  return createElement(UserCtx.Provider, { value }, children);
}

/** Read the current user / profile / loading state. Must be called inside
 *  <UserProvider>. */
export function useUser(): UserState {
  const v = useContext(UserCtx);
  if (!v) {
    // Defensive default — keeps things rendering if a stray <AuthBadge>
    // somehow ends up outside the provider tree (it shouldn't).
    return {
      user: null,
      profile: null,
      loading: false,
      ownedThemeIds: new Set<string>(),
      signOut: async () => {},
      reloadProfile: async () => {},
      reloadOwnership: async () => {},
    };
  }
  return v;
}
