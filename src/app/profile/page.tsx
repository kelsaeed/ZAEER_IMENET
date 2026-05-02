'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { getSupabaseBrowser } from '@/lib/supabase/client';

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, loading, reloadProfile } = useUser();
  const { theme, t } = useSettings();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setBio(profile.bio ?? '');
    }
  }, [profile]);

  if (loading || !user) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: theme.bgGradient, color: theme.textPrimary }}>
        <div className="opacity-60">…</div>
      </main>
    );
  }

  async function saveProfile() {
    setMsg(null); setErr(null); setSavingProfile(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() || 'Player', bio: bio.trim() || null })
      .eq('id', user!.id);
    setSavingProfile(false);
    if (error) { setErr(error.message); return; }
    await reloadProfile();
    setMsg('Profile updated.');
  }

  async function changePassword() {
    setMsg(null); setErr(null);
    if (newPassword.length < 10) { setErr('Password must be at least 10 characters.'); return; }
    setSavingPassword(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) { setErr(error.message); return; }
    setNewPassword('');
    setMsg('Password updated.');
  }

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: theme.bgGradient, color: theme.textPrimary }}>
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm opacity-70 hover:opacity-100">← {t('auth.backHome')}</Link>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6 mt-3"
          style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
        >
          <h1 className="text-2xl font-extrabold mb-1" style={{ color: theme.p1Color }}>
            @{profile?.username}
          </h1>
          <p className="text-sm opacity-70 mb-1">{user.email}</p>
          {profile?.is_admin && <p className="text-xs mb-3" style={{ color: theme.p1Color }}>★ {t('auth.admin')}</p>}

          <div className="grid grid-cols-3 gap-3 my-4">
            <Stat label="Rating" value={profile?.rating ?? 1000} theme={theme} />
            <Stat label="Wins"   value={profile?.wins ?? 0} theme={theme} />
            <Stat label="Losses" value={profile?.losses ?? 0} theme={theme} />
          </div>

          {(msg || err) && (
            <div
              className="text-sm rounded-md px-3 py-2 mb-3"
              style={
                err
                  ? { background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.4)', color: '#fecaca' }
                  : { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#bbf7d0' }
              }
            >
              {err ?? msg}
            </div>
          )}

          <h2 className="text-lg font-bold mt-2 mb-2">Profile</h2>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Display name"
              maxLength={50}
              className="rounded-lg px-3 py-2"
              style={{ background: theme.inputBg, color: theme.inputText, border: `1px solid ${theme.buttonBorder}` }}
            />
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder="Short bio"
              maxLength={280}
              rows={3}
              className="rounded-lg px-3 py-2"
              style={{ background: theme.inputBg, color: theme.inputText, border: `1px solid ${theme.buttonBorder}` }}
            />
            <button
              onClick={saveProfile}
              disabled={savingProfile}
              className="self-start rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
              style={{ background: theme.buttonRotateBg, border: `1px solid ${theme.buttonRotateBorder}`, color: theme.buttonRotateText }}
            >
              {savingProfile ? '…' : 'Save profile'}
            </button>
          </div>

          <h2 className="text-lg font-bold mt-6 mb-2">Change password</h2>
          <div className="flex flex-col gap-3">
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password (10+ characters)"
              className="rounded-lg px-3 py-2"
              style={{ background: theme.inputBg, color: theme.inputText, border: `1px solid ${theme.buttonBorder}` }}
            />
            <button
              onClick={changePassword}
              disabled={savingPassword || newPassword.length < 10}
              className="self-start rounded-lg px-4 py-2 font-semibold disabled:opacity-50"
              style={{ background: theme.buttonRotateBg, border: `1px solid ${theme.buttonRotateBorder}`, color: theme.buttonRotateText }}
            >
              {savingPassword ? '…' : 'Update password'}
            </button>
          </div>
        </motion.div>
      </div>
    </main>
  );
}

function Stat({ label, value, theme }: { label: string; value: number; theme: ReturnType<typeof useSettings>['theme'] }) {
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}>
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-xl font-bold" style={{ color: theme.p1Color }}>{value}</div>
    </div>
  );
}
