import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Service-role Supabase client. Use ONLY in server-side route handlers
 *  for paths that legitimately need to bypass RLS — currently the daily
 *  puzzle solution lookup, since solutions are admin-only via RLS but
 *  the player API has to read them to validate moves.
 *
 *  Never import this from a client component. The service role key has
 *  full access to the database; leaking it via a client bundle would be
 *  catastrophic. The presence of `SUPABASE_SERVICE_ROLE_KEY` in
 *  process.env is a server-only env var (no NEXT_PUBLIC_ prefix).
 *
 *  Typed as `SupabaseClient<any>` so unknown tables (e.g. ones added by
 *  later migrations without regenerated DB types) don't collapse to
 *  `never` at the .from() call site. The project's existing
 *  browser-client code uses the same convention (see games.ts) — type
 *  safety is enforced via `as RowType` casts at the read sites. */
let cached: SupabaseClient<any> | null = null;

export function getSupabaseAdmin(): SupabaseClient<any> {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
