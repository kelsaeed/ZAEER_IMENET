'use client';
import { useEffect, useState, useCallback } from 'react';
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

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const supabase = getSupabaseBrowser();
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let mounted = true;

    supabase.auth.getUser().then(async ({ data }) => {
      if (!mounted) return;
      setUser(data.user);
      if (data.user) await loadProfile(data.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      if (session?.user) await loadProfile(session.user.id);
      else setProfile(null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  return { user, profile, loading, signOut, reloadProfile: () => user && loadProfile(user.id) };
}
