'use client';
import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { useSettings } from '@/hooks/useSettings';
import LoadingEmojis from '@/components/LoadingEmojis';
import { PieceParade, IconInput } from '@/components/AuthDecor';

const CARD_INITIAL = { opacity: 0, y: 20, scale: 0.96 };
const CARD_ANIMATE = { opacity: 1, y: 0, scale: 1 };
const CARD_TRANSITION = { type: 'spring' as const, damping: 18, stiffness: 200 };

export default function ForgotPasswordPage() {
  const { theme, t } = useSettings();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function sendResetLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // The callback page handles the recovery token and routes the
      // signed-in user to the profile page where they can pick a new
      // password.
      redirectTo: `${window.location.origin}/auth/callback?next=/profile`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
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
          <div className="text-6xl mb-3" aria-hidden>📨</div>
          <h1
            className="text-2xl font-black mb-2"
            style={{
              color: theme.textPrimary,
              textShadow: `0 0 18px color-mix(in srgb, ${theme.p1Color} 50%, transparent)`,
            }}
          >
            Check your inbox
          </h1>
          <p className="text-sm opacity-85 mb-5">
            If an account exists for <span className="font-mono">{email}</span>, you&apos;ll get a
            password-reset link in a moment. The link signs you in straight to your profile
            so you can pick a new password.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-transform active:scale-95"
            style={{
              background: theme.buttonRotateBg,
              border: `1px solid ${theme.buttonRotateBorder}`,
              color: theme.buttonRotateText,
            }}
          >
            ← Back to sign in
          </Link>
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
          Reset password
        </h1>
        <p className="text-sm opacity-80 mb-6 text-center">
          Tell us your email and we&apos;ll send a one-time link to set a new password.
        </p>

        <form onSubmit={sendResetLink} className="flex flex-col gap-3">
          <IconInput
            icon="✉️"
            type="email"
            required
            autoComplete="email"
            placeholder={t('auth.email')}
            value={email}
            onChange={e => setEmail(e.target.value)}
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
            disabled={loading}
            className="rounded-xl py-3 font-extrabold text-base disabled:opacity-70 flex items-center justify-center gap-2 transition-transform active:scale-[0.98] hover:scale-[1.01] mt-1"
            style={{
              background: `linear-gradient(135deg, ${theme.p1Color}, color-mix(in srgb, ${theme.p1Color} 60%, ${theme.p2Color}))`,
              border: `1px solid ${theme.p1Color}`,
              color: '#0a0a14',
              minHeight: 50,
              boxShadow: `0 8px 22px -8px ${theme.p1Color}, 0 0 0 1px rgba(255,255,255,0.1) inset`,
            }}
          >
            {loading ? <LoadingEmojis size={20} gap={3} /> : <>📨 Send reset link</>}
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
