'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { useSettings } from '@/hooks/useSettings';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { uploadAvatar, saveAvatarUrl } from '@/lib/supabase/avatars';
import { listFriendships, FriendProfile } from '@/lib/supabase/friends';
import LoadingEmojis from '@/components/LoadingEmojis';
import Avatar from '@/components/Avatar';
import NotificationBell from '@/components/NotificationBell';

const USERNAME_RE = /^[a-z0-9_]{3,20}$/i;
// Hard cap so a hung request can never freeze the UI forever.
const REQUEST_TIMEOUT_MS = 8000;

// Stable framer-motion targets — see PieceDisplay / BoardCell.
const CARD_INITIAL = { opacity: 0, y: 12 };
const CARD_ANIMATE = { opacity: 1, y: 0 };

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

/** A rating threshold gets a fun rank emoji + label, gives the player
 *  something to grow toward. */
function ratingRank(rating: number): { emoji: string; label: string } {
  if (rating >= 1600) return { emoji: '👑', label: 'Throne Holder' };
  if (rating >= 1400) return { emoji: '🦁', label: 'Lion Tamer' };
  if (rating >= 1200) return { emoji: '⚔️', label: 'Warrior' };
  if (rating >= 1050) return { emoji: '🛡️', label: 'Defender' };
  return { emoji: '🌱', label: 'Newcomer' };
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
  const [friends, setFriends] = useState<FriendProfile[] | null>(null);
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

  // Load friends — non-critical, runs in the background after the page renders.
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    listFriendships(user.id)
      .then(list => { if (mounted) setFriends(list); })
      .catch(() => { if (mounted) setFriends([]); }); // RLS / migration error → empty
    return () => { mounted = false; };
  }, [user]);

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

  const rating = profile?.rating ?? 1000;
  const wins = profile?.wins ?? 0;
  const losses = profile?.losses ?? 0;
  const draws = profile?.draws ?? 0;
  const totalGames = wins + losses + draws;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const rank = ratingRank(rating);

  return (
    <main
      className="min-h-screen px-4 py-8 sm:py-12"
      style={{ background: theme.bgGradient, color: theme.textPrimary }}
    >
      <div className="fixed top-3 right-3 z-30">
        <NotificationBell />
      </div>

      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm opacity-70 hover:opacity-100 mb-4"
        >
          ← {t('auth.backHome')}
        </Link>

        {/* Hero banner — wide gradient with the player accent, big animated
            avatar, name + rank badge. Sets the mood for the whole page. */}
        <motion.div
          initial={CARD_INITIAL}
          animate={CARD_ANIMATE}
          className="rounded-3xl p-6 sm:p-8 mb-4 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${theme.p1Color} 22%, ${theme.panelBg}) 0%, color-mix(in srgb, ${theme.p2Color} 14%, ${theme.panelBg}) 100%)`,
            border: `1px solid ${theme.p1AccentBorder}`,
            boxShadow: `0 30px 80px -20px rgba(0,0,0,0.5)`,
          }}
        >
          {/* Soft radial glow behind the avatar */}
          <div
            className="absolute pointer-events-none"
            aria-hidden
            style={{
              top: '-30%', left: '-10%',
              width: '50%', height: '120%',
              background: `radial-gradient(ellipse at center, color-mix(in srgb, ${theme.p1Color} 40%, transparent), transparent 60%)`,
              opacity: 0.6,
              filter: 'blur(20px)',
            }}
          />

          <div className="flex items-center gap-4 sm:gap-5 relative">
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
                size={88}
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
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  className="text-2xl sm:text-3xl font-black truncate"
                  style={{
                    color: theme.textPrimary,
                    textShadow: `0 0 18px color-mix(in srgb, ${theme.p1Color} 50%, transparent)`,
                  }}
                >
                  {profile?.display_name ?? '—'}
                </h1>
                {rating >= 1200 && (
                  <span
                    className="text-2xl"
                    style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}
                    aria-hidden
                  >
                    👑
                  </span>
                )}
              </div>
              <div className="text-sm opacity-80 truncate font-mono">@{profile?.username ?? '…'}</div>

              {/* Rank chip */}
              <div
                className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-xs font-bold"
                style={{
                  background: theme.p1AccentBg,
                  border: `1px solid ${theme.p1AccentBorder}`,
                  color: theme.p1Color,
                }}
              >
                <span aria-hidden>{rank.emoji}</span>
                <span>{rank.label}</span>
                <span className="opacity-60">·</span>
                <span>{rating}</span>
              </div>

              {profile?.is_admin && (
                <div className="text-xs mt-1.5" style={{ color: theme.p1Color }}>
                  ★ {t('auth.admin')}
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Body card holds everything else */}
        <motion.div
          initial={CARD_INITIAL}
          animate={CARD_ANIMATE}
          transition={{ delay: 0.05 }}
          className="rounded-2xl p-5 sm:p-7"
          style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
        >
          {/* Share link card */}
          {profile?.username && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl p-3 mb-5 flex items-center gap-3"
              style={{
                background: `linear-gradient(135deg, color-mix(in srgb, ${theme.p1Color} 14%, transparent), color-mix(in srgb, ${theme.p2Color} 10%, transparent))`,
                border: `1px solid ${theme.p1AccentBorder}`,
              }}
            >
              <div
                className="rounded-full w-10 h-10 flex items-center justify-center text-lg shrink-0"
                style={{
                  background: theme.p1AccentBg,
                  border: `1px solid ${theme.p1AccentBorder}`,
                  color: theme.p1Color,
                }}
              >
                🔗
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold mb-0.5" style={{ color: theme.p1Color }}>
                  Share your profile
                </div>
                <div
                  className="text-xs opacity-80 truncate font-mono"
                  style={{ direction: 'ltr' }}
                  title={`/u/${profile.username}`}
                >
                  /u/{profile.username}
                </div>
              </div>
              <button
                onClick={copyShareLink}
                className="rounded-lg px-3 py-2 text-sm font-bold inline-flex items-center gap-1.5 transition-transform active:scale-95 shrink-0"
                style={{
                  background: shareCopied ? theme.p1Color : theme.buttonRotateBg,
                  border: `1px solid ${shareCopied ? theme.p1Color : theme.buttonRotateBorder}`,
                  color: shareCopied ? '#000' : theme.buttonRotateText,
                }}
              >
                {shareCopied ? <>✓ Copied</> : <>📋 Copy</>}
              </button>
            </motion.div>
          )}

          {/* Stats — emoji-led tiles + a winrate bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
            <Stat icon="🏆" label="Rating" value={rating} accent={theme.p1Color} theme={theme} />
            <Stat icon="⚔️" label="Wins"   value={wins}   accent="#22c55e"     theme={theme} />
            <Stat icon="🛡️" label="Losses" value={losses} accent="#fb7185"     theme={theme} />
            <Stat icon="🤝" label="Draws"  value={draws}  accent={theme.p2Color} theme={theme} />
          </div>
          {totalGames > 0 && (
            <div className="mb-5">
              <div className="flex items-center justify-between text-xs opacity-80 mb-1">
                <span className="font-semibold">Win rate</span>
                <span className="font-mono">{winRate}% · {totalGames} game{totalGames === 1 ? '' : 's'}</span>
              </div>
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}` }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${winRate}%` }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                  className="h-full"
                  style={{
                    background: `linear-gradient(90deg, ${theme.p1Color}, #22c55e)`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Friends preview */}
          <FriendsCard friends={friends} />

          {/* Toast */}
          {(msg || err) && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm rounded-lg px-3 py-2 mb-4 flex items-center gap-2"
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
              <span aria-hidden>{err ? '⚠️' : '✅'}</span>
              {err ?? msg}
            </motion.div>
          )}

          {/* Profile form */}
          <SectionHeader icon="📝" title="Edit my hero" theme={theme} />
          <div className="flex flex-col gap-3 mb-6">
            <Field label="Username" hint="3–20 letters, digits or underscore">
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value.replace(/\s+/g, ''))}
                maxLength={20}
                className="rounded-lg px-3 py-2 w-full transition-shadow focus:outline-none"
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
                className="rounded-lg px-3 py-2 w-full focus:outline-none"
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
                placeholder="A short line about you ✨"
                maxLength={280}
                rows={3}
                className="rounded-lg px-3 py-2 w-full resize-y focus:outline-none"
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
              className="self-start rounded-xl px-5 py-2.5 font-bold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 min-w-[150px] min-h-[44px] transition-transform active:scale-95 hover:scale-[1.02]"
              style={{
                background: isDirty
                  ? `linear-gradient(135deg, ${theme.p1Color}, color-mix(in srgb, ${theme.p1Color} 60%, ${theme.p2Color}))`
                  : theme.buttonRotateBg,
                border: `1px solid ${isDirty ? theme.p1Color : theme.buttonRotateBorder}`,
                color: isDirty ? '#0a0a14' : theme.buttonRotateText,
                boxShadow: isDirty ? `0 6px 18px -8px ${theme.p1Color}` : undefined,
              }}
            >
              {savingProfile ? <LoadingEmojis size={16} gap={2} /> : <>💾 Save profile</>}
            </button>
          </div>

          {/* Password form */}
          <SectionHeader icon="🔑" title="Change the secret" theme={theme} />
          <div className="flex flex-col gap-3">
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password (10+ characters)"
              className="rounded-lg px-3 py-2 w-full focus:outline-none"
              style={{
                background: theme.inputBg,
                color: theme.inputText,
                border: `1px solid ${theme.buttonBorder}`,
              }}
            />
            <button
              onClick={changePassword}
              disabled={savingPassword || newPassword.length < 10}
              className="self-start rounded-xl px-5 py-2.5 font-bold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 min-w-[170px] min-h-[44px] transition-transform active:scale-95 hover:scale-[1.02]"
              style={{
                background: theme.buttonRotateBg,
                border: `1px solid ${theme.buttonRotateBorder}`,
                color: theme.buttonRotateText,
              }}
            >
              {savingPassword ? <LoadingEmojis size={16} gap={2} /> : <>🔄 Update password</>}
            </button>
          </div>
        </motion.div>
      </div>
    </main>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
  theme,
}: {
  icon: string;
  label: string;
  value: number;
  accent: string;
  theme: ReturnType<typeof useSettings>['theme'];
}) {
  return (
    <div
      className="rounded-xl p-3 text-center transition-transform hover:scale-[1.03]"
      style={{
        background: `linear-gradient(160deg, color-mix(in srgb, ${accent} 14%, ${theme.panelBg}), ${theme.panelBg})`,
        border: `1px solid color-mix(in srgb, ${accent} 35%, ${theme.panelBorder})`,
      }}
    >
      <div className="text-xl mb-0.5" aria-hidden>{icon}</div>
      <div className="text-xs opacity-70">{label}</div>
      <div className="text-xl font-black" style={{ color: accent }}>{value}</div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  theme,
}: {
  icon: string;
  title: string;
  theme: ReturnType<typeof useSettings>['theme'];
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span aria-hidden className="text-lg">{icon}</span>
      <h2 className="text-lg font-bold" style={{ color: theme.p1Color }}>{title}</h2>
      <span className="flex-1 h-px opacity-25" style={{ background: theme.p1Color }} />
    </div>
  );
}

function FriendsCard({ friends }: { friends: FriendProfile[] | null }) {
  const { theme } = useSettings();
  const accepted = friends?.filter(f => f.status === 'accepted') ?? [];
  const pending = friends?.filter(f => f.status === 'pending' && !f.outgoing) ?? [];
  const previewLimit = 6;
  const preview = accepted.slice(0, previewLimit);
  const moreCount = Math.max(0, accepted.length - previewLimit);

  return (
    <div
      className="rounded-xl p-4 mb-5"
      style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold">🤝 Friends</span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-bold"
            style={{
              background: theme.p1AccentBg,
              border: `1px solid ${theme.p1AccentBorder}`,
              color: theme.p1Color,
            }}
          >
            {friends === null ? '…' : accepted.length}
          </span>
          {pending.length > 0 && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-bold"
              style={{
                background: 'rgba(244,114,182,0.18)',
                border: '1px solid rgba(244,114,182,0.45)',
                color: '#f9a8d4',
              }}
              title={`${pending.length} incoming friend request${pending.length > 1 ? 's' : ''}`}
            >
              📥 {pending.length}
            </span>
          )}
        </div>
        <Link
          href="/play"
          className="text-xs opacity-70 hover:opacity-100 hover:underline"
          style={{ color: theme.p1Color }}
        >
          Open ↗
        </Link>
      </div>

      {friends === null ? (
        <div className="flex items-center justify-center py-3">
          <LoadingEmojis size={18} gap={3} />
        </div>
      ) : accepted.length === 0 ? (
        <div className="text-center py-3">
          <div className="text-2xl mb-1">🪑</div>
          <div className="text-sm opacity-70">No friends yet.</div>
          <Link
            href="/play"
            className="inline-block mt-2 text-xs font-semibold underline"
            style={{ color: theme.p1Color }}
          >
            Find someone to play with →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {preview.map(f => (
            <Link
              key={f.id}
              href={`/u/${f.username}`}
              className="flex items-center gap-2 rounded-lg p-2 hover:scale-[1.02] transition-transform"
              style={{
                background: theme.inputBg,
                border: `1px solid ${theme.buttonBorder}`,
              }}
            >
              <Avatar url={f.avatar_url} name={f.display_name} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{f.display_name}</div>
                <div className="text-xs opacity-70 truncate">@{f.username}</div>
              </div>
            </Link>
          ))}
          {moreCount > 0 && (
            <Link
              href="/play"
              className="flex items-center justify-center gap-1 rounded-lg p-2 text-sm font-bold hover:scale-[1.02] transition-transform"
              style={{
                background: theme.p1AccentBg,
                border: `1px dashed ${theme.p1AccentBorder}`,
                color: theme.p1Color,
              }}
            >
              + {moreCount} more
            </Link>
          )}
        </div>
      )}
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
