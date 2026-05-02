'use client';
import { createBrowserClient } from '@supabase/ssr';

/** Browser-side Supabase client. Uses the public anon key — RLS does the
 *  real protection on every row. Lazy-init so it only runs in the browser. */
let cached: ReturnType<typeof createBrowserClient> | null = null;

/** No-op lock. The default `navigatorLock` is meant for cross-tab
 *  synchronisation but emits noisy "lock was stolen" errors in single-tab
 *  Next.js dev when multiple auth calls overlap. Our session is one tab,
 *  one process — running the work directly is fine and silent. */
const noopLock = async <R,>(_name: string, _timeout: number, fn: () => Promise<R>): Promise<R> => fn();

export function getSupabaseBrowser() {
  if (cached) return cached;
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        lock: noopLock,
      },
    },
  );
  return cached;
}
