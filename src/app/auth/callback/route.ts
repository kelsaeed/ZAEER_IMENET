import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

// Handles the redirect after Google OAuth and after the user clicks the
// email-verification or magic-link in their inbox. Exchanges the one-time
// `code` for a real session cookie, then bounces back to the app.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

  if (code) {
    const supabase = getSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  // Anything else: bounce to login with an error flag so we can surface it.
  return NextResponse.redirect(new URL('/login?error=auth', url.origin));
}
