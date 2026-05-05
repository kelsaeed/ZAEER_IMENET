'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { useSettings } from '@/hooks/useSettings';
import { useUser } from '@/hooks/useUser';
import LoadingEmojis from '@/components/LoadingEmojis';
import { PieceParade, IconInput } from '@/components/AuthDecor';

const CARD_INITIAL = { opacity: 0, y: 20, scale: 0.96 };
const CARD_ANIMATE = { opacity: 1, y: 0, scale: 1 };
const CARD_TRANSITION = { type: 'spring' as const, damping: 18, stiffness: 200 };

/** Step 2 of the forgot-password flow. The user clicks the magic link in
 *  their email → /auth/callback exchanges the code for a session → they
 *  land here. We just need to call updateUser({ password }) and bounce
 *  them to their profile.
 *
 *  This page intentionally does NOT redirect unauthenticated visitors:
 *  the previous flow targeted /profile, whose login redirect raced the
 *  freshly-set cookie and threw the user back to the sign-in screen. If
 *  the session truly didn't take, we let updateUser fail loudly so the
 *  user gets a useful error rather than a silent kick to login. */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { theme } = useSettings();
  const { user, loading: userLoading } = useUser();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  // Some Supabase email templates still hand us a hash-style token
  // (`#access_token=…&refresh_token=…&type=recovery`) instead of the PKCE
  // `?code=…` that /auth/callback consumes. Catch that variant here and
  // promote it into a real session so updateUser works either way.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.hash) return;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      const supabase = getSupabaseBrowser();
      void supabase.auth.setSession({ access_token, refresh_token }).then(() => {
        // Strip the sensitive tokens from the URL.
        history.replaceState(null, '', window.location.pathname);
      });
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10) {
      setError('Password must be at least 10 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords don’t match.');
      return;
    }
    setBusy(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    // Send them to their profile so they land somewhere useful.
    setTimeout(() => router.replace('/profile'), 1200);
  }

  if (done) {
    return (
      <main
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: theme.bgGradient, color: theme.textPrimary }}
      >
        <motion.div
          initial={CARD_INITIAL}
          animate={CARD_ANIMATE}
          transition={CARD_TRANSITION}
          className="max-w-md rounded-3xl p-7 text-center shadow-2xl"
          style={{
            background: `linear-gradient(160deg, color-mix(in srgb, ${theme.p1Color} 8%, ${theme.panelBg}) 0%, ${theme.panelBg} 60%)`,
            border: `1px solid ${theme.p1AccentBorder}`,
          }}
        >
          <div className="text-6xl mb-3" aria-hidden>✅</div>
          <h1
            className="text-2xl font-black mb-2"
            style={{
              color: theme.textPrimary,
              textShadow: `0 0 18px color-mix(in srgb, ${theme.p1Color} 50%, transparent)`,
            }}
          >
            Password updated
          </h1>
          <p className="text-sm opacity-85">Sending you to your profile…</p>
        </motion.div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: theme.bgGradient, color: theme.textPrimary }}
    >
      <motion.div
        initial={CARD_INITIAL}
        animate={CARD_ANIMATE}
        transition={CARD_TRANSITION}
        className="w-full max-w-md rounded-3xl p-7 shadow-2xl"
        style={{
          background: `linear-gradient(160deg, color-mix(in srgb, ${theme.p1Color} 8%, ${theme.panelBg}) 0%, ${theme.panelBg} 60%)`,
          border: `1px solid ${theme.p1AccentBorder}`,
          boxShadow: `0 30px 80px -20px rgba(0,0,0,0.55), 0 0 0 1px color-mix(in srgb, ${theme.p1Color} 25%, transparent) inset`,
        }}
      >
        <PieceParade />

        <h1
          className="text-3xl sm:text-[2rem] font-black tracking-tight text-center mb-1"
          style={{
            color: theme.textPrimary,
            textShadow: `0 0 18px color-mix(in srgb, ${theme.p1Color} 50%, transparent)`,
          }}
        >
          Set a new password
        </h1>
        <p className="text-sm opacity-80 mb-6 text-center">
          {userLoading ? 'Verifying your link…' : user ? `Signed in as ${user.email}` : 'Pick something at least 10 characters long.'}
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <IconInput
            icon="🔒"
            type="password"
            required
            autoComplete="new-password"
            placeholder="New password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          <IconInput
            icon="🔁"
            type="password"
            required
            autoComplete="new-password"
            placeholder="Confirm password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
          />
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm rounded-lg px-3 py-2 flex items-center gap-2"
              style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', color: '#fecaca' }}
            >
              <span aria-hidden>⚠️</span>
              {error}
            </motion.div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl py-3 font-extrabold text-base disabled:opacity-70 flex items-center justify-center gap-2 transition-transform active:scale-[0.98] hover:scale-[1.01] mt-1"
            style={{
              background: `linear-gradient(135deg, ${theme.p1Color}, color-mix(in srgb, ${theme.p1Color} 60%, ${theme.p2Color}))`,
              border: `1px solid ${theme.p1Color}`,
              color: '#0a0a14',
              minHeight: 50,
              boxShadow: `0 8px 22px -8px ${theme.p1Color}, 0 0 0 1px rgba(255,255,255,0.1) inset`,
            }}
          >
            {busy ? <LoadingEmojis size={20} gap={3} /> : <>🔐 Update password</>}
          </button>
        </form>

        <div className="text-sm mt-5 text-center">
          <Link
            href="/login"
            className="hover:underline font-semibold inline-flex items-center gap-1"
            style={{ color: theme.p1Color }}
          >
            ← Back to sign in
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
