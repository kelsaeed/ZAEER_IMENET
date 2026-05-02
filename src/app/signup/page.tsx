'use client';
import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { useSettings } from '@/hooks/useSettings';

const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === 'true';

export default function SignupPage() {
  const { theme, t } = useSettings();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const validUsername = /^[a-z0-9_]{3,20}$/i;

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validUsername.test(username)) {
      setError(t('auth.usernameRule'));
      return;
    }
    if (password.length < 10) {
      setError(t('auth.passwordRule'));
      return;
    }

    setLoading(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
        data: {
          username: username.toLowerCase(),
          display_name: displayName || username,
        },
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSuccess(true);
  }

  async function signInWithGoogle() {
    setError(null);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
    });
    if (error) setError(error.message);
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: theme.bgGradient, color: theme.textPrimary }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md rounded-2xl p-6 text-center"
          style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
        >
          <div className="text-4xl mb-3">📧</div>
          <h1 className="text-xl font-extrabold mb-2" style={{ color: theme.p1Color }}>
            {t('auth.checkEmailTitle')}
          </h1>
          <p className="text-sm opacity-80 mb-4">{t('auth.checkEmailBody').replace('{email}', email)}</p>
          <Link href="/login" className="text-sm hover:underline" style={{ color: theme.p1Color }}>
            {t('auth.goToLogin')} →
          </Link>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: theme.bgGradient, color: theme.textPrimary }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
      >
        <h1 className="text-2xl font-extrabold mb-1" style={{ color: theme.p1Color }}>
          {t('auth.signUpTitle')}
        </h1>
        <p className="text-sm opacity-70 mb-5">{t('auth.signUpSubtitle')}</p>

        {GOOGLE_ENABLED && (
          <>
            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full rounded-lg py-2.5 mb-3 font-semibold flex items-center justify-center gap-2"
              style={{ background: '#fff', color: '#1f2937' }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 33.4 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.5 39.5 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C40.1 36 44 30.6 44 24c0-1.2-.1-2.3-.4-3.5z"/>
              </svg>
              {t('auth.continueWithGoogle')}
            </button>

            <div className="flex items-center gap-2 my-4 opacity-60 text-xs">
              <span className="flex-1 h-px bg-current opacity-30" />
              <span>{t('auth.or')}</span>
              <span className="flex-1 h-px bg-current opacity-30" />
            </div>
          </>
        )}

        <form onSubmit={signUp} className="flex flex-col gap-3">
          <input
            type="text"
            required
            autoComplete="nickname"
            placeholder={t('auth.displayName')}
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            maxLength={50}
            className="rounded-lg px-3 py-2"
            style={{ background: theme.inputBg, color: theme.inputText, border: `1px solid ${theme.buttonBorder}` }}
          />
          <input
            type="text"
            required
            autoComplete="username"
            placeholder={t('auth.usernamePlaceholder')}
            value={username}
            onChange={e => setUsername(e.target.value.replace(/\s+/g, '').toLowerCase())}
            maxLength={20}
            className="rounded-lg px-3 py-2"
            style={{ background: theme.inputBg, color: theme.inputText, border: `1px solid ${theme.buttonBorder}` }}
          />
          <input
            type="email"
            required
            autoComplete="email"
            placeholder={t('auth.email')}
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="rounded-lg px-3 py-2"
            style={{ background: theme.inputBg, color: theme.inputText, border: `1px solid ${theme.buttonBorder}` }}
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder={t('auth.passwordPlaceholder')}
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="rounded-lg px-3 py-2"
            style={{ background: theme.inputBg, color: theme.inputText, border: `1px solid ${theme.buttonBorder}` }}
          />
          {error && (
            <div className="text-sm rounded-md px-3 py-2" style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', color: '#fecaca' }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg py-2.5 font-bold disabled:opacity-50"
            style={{
              background: theme.buttonRotateBg,
              border: `1px solid ${theme.buttonRotateBorder}`,
              color: theme.buttonRotateText,
            }}
          >
            {loading ? '…' : t('auth.signUp')}
          </button>
        </form>

        <p className="text-xs opacity-60 mt-4 text-center">
          {t('auth.signUpDisclaimer')}
        </p>

        <div className="text-sm mt-3 text-center">
          <Link href="/login" className="hover:underline" style={{ color: theme.p1Color }}>
            {t('auth.haveAccount')}
          </Link>
        </div>

        <Link href="/" className="block text-center text-xs opacity-60 mt-4 hover:opacity-100">
          ← {t('auth.backHome')}
        </Link>
      </motion.div>
    </main>
  );
}
