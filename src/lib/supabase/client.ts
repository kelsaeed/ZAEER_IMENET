'use client';
import { createBrowserClient } from '@supabase/ssr';

/** Browser-side Supabase client. Uses the public anon key — RLS does the
 *  real protection on every row. Lazy-init so it only runs in the browser. */
let cached: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowser() {
  if (cached) return cached;
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return cached;
}
