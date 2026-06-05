'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { uploadAvatar, saveAvatarUrl } from '@/lib/supabase/avatars';
import { listFriendships, FriendProfile } from '@/lib/supabase/friends';

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

/** All of the profile page's data + mutation logic: form state, the
 *  save / password / avatar / share handlers, the auth-redirect bounce,
 *  and the background friends load. Extracted from the page so the
 *  component is pure presentation. Behaviour is identical to the inline
 *  version — same validation, same handler order, same effects. */
export function useProfileForm() {
  const router = useRouter();
  const { user, profile, loading, reloadProfile } = useUser();

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

  return {
    user, profile, loading,
    username, setUsername,
    displayName, setDisplayName,
    bio, setBio,
    newPassword, setNewPassword,
    savingProfile, savingPassword, uploadingAvatar, shareCopied,
    friends, fileInputRef,
    msg, err, isDirty,
    saveProfile, changePassword, handleAvatarPick, handleAvatarChange, copyShareLink,
  };
}
