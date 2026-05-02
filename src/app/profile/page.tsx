'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { uploadAvatar, saveAvatarUrl } from '@/lib/supabase/avatars';
import LoadingEmojis from '@/components/LoadingEmojis';
import Avatar from '@/components/Avatar';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;
// Hard cap so a hung request can never freeze the UI forever.
const REQUEST_TIMEOUT_MS = 8000;

function withTimeout<T>(p: PromiseLike<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  // Wrap with Promise.resolve so Supabase's "thenable" query builder is
  // accepted by Promise.race (the type isn't a strict Promise<T>).
  return Promise.race<T>([
    Promise.resolve(p),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out — try again.')), ms),
    ),
  ]);
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, loading, reloadProfile } = useUser();
  const { theme, t } = useSettings();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // The form is only "dirty" once the user changes something — we use this
  // to enable/disable the Save button.
  const initialRef = useRef({ username: '', displayName: '', bio: '' });

  // Bounce unauthenticated visitors to the login page.
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Hydrate the form from the loaded profile, but only once — keep the
  // user's edits intact if the profile reloads in the background.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!profile || hydratedRef.current) return;
    setUsername(profile.username);
    setDisplayName(profile.display_name);
    setBio(profile.bio ?? '');
    initialRef.current = {
      username: profile.username,
      displayName: profile.display_name,
      bio: profile.bio ?? '',
    };
    hydratedRef.current = true;
  }, [profile]);

  if (loading || !user) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        style={{ background: theme.bgGradient, color: theme.textPrimary }}
      >
        <LoadingEmojis size={28} />
      </main>
    );
  }

  const isDirty =
    username !== initialRef.current.username ||
    displayName !== initialRef.current.displayName ||
    bio !== initialRef.current.bio;

  function flashSuccess(text: string) {
    setErr(null);
    setMsg(text);
    setTimeout(() => setMsg(null), 3000);
  }
  function flashError(text: string) {
    setMsg(null);
    setErr(text);
  }

  async function saveProfile() {
    setMsg(null); setErr(null);

    const trimmedUsername = username.trim().toLowerCase();
    const trimmedName = displayName.trim();
    const trimmedBio = bio.trim();

    if (!USERNAME_RE.test(trimmedUsername)) {
      flashError('Username must be 3–20 letters / digits / underscore.');
      return;
    }
    if (trimmedName.length < 1) {
      flashError('Display name cannot be empty.');
      return;
    }
    if (trimmedBio.length > 280) {
      flashError('Bio is limited to 280 characters.');
      return;
    }

    setSavingProfile(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await withTimeout(
        supabase
          .from('profiles')
          .update({
            username: trimmedUsername,
            display_name: trimmedName,
            bio: trimmedBio || null,
          })
          .eq('id', user!.id)
          .select()
          .single(),
      );
      if (error) {
        if (error.code === '23505') {
          flashError('That username is already taken — pick another.');
        } else {
          flashError(error.message);
        }
        return;
      }
      initialRef.current = {
        username: trimmedUsername,
        displayName: trimmedName,
        bio: trimmedBio,
      };
      await reloadProfile();
      flashSuccess('Profile updated.');
    } catch (e: unknown) {
      flashError(e instanceof Error ? e.message : 'Could not save — try again.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    setMsg(null); setErr(null);
    if (newPassword.length < 10) {
      flashError('Password must be at least 10 characters.');
      return;
    }
    setSavingPassword(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await withTimeout(
        supabase.auth.updateUser({ password: newPassword }),
      );
      if (error) {
        flashError(error.message);
        return;
      }
      setNewPassword('');
      flashSuccess('Password updated.');
    } catch (e: unknown) {
      flashError(e instanceof Error ? e.message : 'Could not update password — try again.');
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleAvatarPick() {
    fileInputRef.current?.click();
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setMsg(null); setErr(null); setUploadingAvatar(true);
    try {
      const url = await withTimeout(uploadAvatar({ userId: user.id, file }));
      await withTimeout(saveAvatarUrl({ userId: user.id, url }));
      await reloadProfile();
      flashSuccess('Avatar updated.');
    } catch (e: unknown) {
      flashError(e instanceof Error ? e.message : 'Could not upload image — try a smaller file.');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function copyShareLink() {
    if (!profile?.username) return;
    const url = `${window.location.origin}/u/${profile.username}`;
    navigator.clipboard?.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1800);
  }

  return (
    <main
      className="min-h-screen px-4 py-8 sm:py-12"
      style={{ background: theme.bgGradient, color: theme.textPrimary }}
    >
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100 mb-4"
        >
          ← {t('auth.backHome')}
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 sm:p-7"
          style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
        >
          {/* Header */}
          <div className="flex items-center gap-4 mb-5">
            <button
              onClick={handleAvatarPick}
              disabled={uploadingAvatar}
              aria-label="Change avatar"
              className="relative shrink-0 group rounded-full"
            >
              <Avatar
                url={profile?.avatar_url}
                name={profile?.display_name}
                email={user.email}
                size={72}
                ring
              />
              <span
                className="absolute inset-0 rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
              >
                {uploadingAvatar ? <LoadingEmojis size={14} gap={2} /> : '📷 Upload'}
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <div className="min-w-0 flex-1">
              <h1
                className="text-xl sm:text-2xl font-extrabold truncate"
                style={{ color: theme.p1Color }}
              >
                {profile?.display_name ?? '—'}
              </h1>
              <div className="text-sm opacity-70 truncate">@{profile?.username ?? '…'}</div>
              <div className="text-xs opacity-60 truncate">{user.email}</div>
              {profile?.username && (
                <button
                  onClick={copyShareLink}
                  className="text-xs mt-1 underline opacity-70 hover:opacity-100 inline-flex items-center gap-1"
                  style={{ color: theme.p1Color }}
                >
                  🔗 {shareCopied ? 'Copied!' : 'Copy share link'}
                </button>
              )}
              {profile?.is_admin && (
                <div className="text-xs mt-1" style={{ color: theme.p1Color }}>
                  ★ {t('auth.admin')}
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <Stat label="Rating" value={profile?.rating ?? 1000} theme={theme} />
            <Stat label="Wins"   value={profile?.wins ?? 0}   theme={theme} />
            <Stat label="Losses" value={profile?.losses ?? 0} theme={theme} />
          </div>

          {/* Toast */}
          {(msg || err) && (
            <div
              className="text-sm rounded-md px-3 py-2 mb-4"
              style={
                err
                  ? {
                      background: 'rgba(220,38,38,0.15)',
                      border: '1px solid rgba(220,38,38,0.4)',
                      color: '#fecaca',
                    }
                  : {
                      background: 'rgba(34,197,94,0.15)',
                      border: '1px solid rgba(34,197,94,0.4)',
                      color: '#bbf7d0',
                    }
              }
            >
              {err ?? msg}
            </div>
          )}

          {/* Profile form */}
          <h2 className="text-lg font-bold mb-3">Profile</h2>
          <div className="flex flex-col gap-3 mb-6">
            <Field label="Username" hint="3–20 letters, digits or underscore">
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value.replace(/\s+/g, ''))}
                maxLength={20}
                className="rounded-lg px-3 py-2 w-full"
                style={{
                  background: theme.inputBg,
                  color: theme.inputText,
                  border: `1px solid ${theme.buttonBorder}`,
                }}
              />
            </Field>

            <Field label="Display name">
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                maxLength={50}
                className="rounded-lg px-3 py-2 w-full"
                style={{
                  background: theme.inputBg,
                  color: theme.inputText,
                  border: `1px solid ${theme.buttonBorder}`,
                }}
              />
            </Field>

            <Field label="Bio" hint={`${bio.length}/280`}>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="A short line about you"
                maxLength={280}
                rows={3}
                className="rounded-lg px-3 py-2 w-full resize-y"
                style={{
                  background: theme.inputBg,
                  color: theme.inputText,
                  border: `1px solid ${theme.buttonBorder}`,
                }}
              />
            </Field>

            <button
              onClick={saveProfile}
              disabled={savingProfile || !isDirty}
              className="self-start rounded-lg px-4 py-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center min-w-[140px] min-h-[40px]"
              style={{
                background: theme.buttonRotateBg,
                border: `1px solid ${theme.buttonRotateBorder}`,
                color: theme.buttonRotateText,
              }}
            >
              {savingProfile ? <LoadingEmojis size={16} gap={2} /> : 'Save profile'}
            </button>
          </div>

          {/* Password form */}
          <h2 className="text-lg font-bold mb-3">Change password</h2>
          <div className="flex flex-col gap-3">
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password (10+ characters)"
              className="rounded-lg px-3 py-2 w-full"
              style={{
                background: theme.inputBg,
                color: theme.inputText,
                border: `1px solid ${theme.buttonBorder}`,
              }}
            />
            <button
              onClick={changePassword}
              disabled={savingPassword || newPassword.length < 10}
              className="self-start rounded-lg px-4 py-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center min-w-[160px] min-h-[40px]"
              style={{
                background: theme.buttonRotateBg,
                border: `1px solid ${theme.buttonRotateBorder}`,
                color: theme.buttonRotateText,
              }}
            >
              {savingPassword ? <LoadingEmojis size={16} gap={2} /> : 'Update password'}
            </button>
          </div>
        </motion.div>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  theme,
}: {
  label: string;
  value: number;
  theme: ReturnType<typeof useSettings>['theme'];
}) {
  return (
    <div
      className="rounded-lg p-3 text-center"
      style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
    >
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-xl font-bold" style={{ color: theme.p1Color }}>{value}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold opacity-85">{label}</span>
        {hint && <span className="text-xs opacity-60">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
