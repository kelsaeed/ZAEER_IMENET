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
}

interface UserState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  reloadProfile: () => Promise<void>;
}

const UserCtx = createContext<UserState | null>(null);

/** App-wide auth provider. Mount once, near the root, so the user state
 *  persists across React re-renders and conditional render branches.
 *  Without this, each <AuthBadge> instance had its own `loading -> user`
 *  cycle and could briefly flash a "Sign in" button after a phase change. */
export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
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
      if (session?.user) void loadProfile(session.user.id);
      else setProfile(null);
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    // Wipe local state FIRST so the UI updates immediately even if the
    // network call to Supabase is slow or fails.
    setUser(null);
    setProfile(null);
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

  const value = useMemo<UserState>(
    () => ({ user, profile, loading, signOut, reloadProfile }),
    [user, profile, loading, signOut, reloadProfile],
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
      signOut: async () => {},
      reloadProfile: async () => {},
    };
  }
  return v;
}
