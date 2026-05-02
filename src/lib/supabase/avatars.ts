'use client';
import { getSupabaseBrowser } from './client';

const BUCKET = 'avatars';

/** Upload a new avatar for the user. Stored at `<userId>/avatar.<ext>`
 *  (path prefix matches the storage RLS policy). Returns the public URL,
 *  with a cache-busting param so the new image is fetched right away. */
export async function uploadAvatar(opts: {
  userId: string;
  file: File;
}): Promise<string> {
  if (opts.file.size > 4 * 1024 * 1024) throw new Error('Image must be under 4 MB.');
  if (!opts.file.type.startsWith('image/')) throw new Error('That file is not an image.');

  const ext = (opts.file.name.split('.').pop() ?? 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${opts.userId}/avatar.${ext || 'png'}`;
  const supabase = getSupabaseBrowser();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, opts.file, { upsert: true, cacheControl: '60' });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Cache-busting suffix so the browser fetches the freshly-uploaded blob.
  return `${data.publicUrl}?t=${Date.now()}`;
}

/** Save the avatar URL onto the profile row. */
export async function saveAvatarUrl(opts: { userId: string; url: string }): Promise<void> {
  const supabase = getSupabaseBrowser();
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: opts.url })
    .eq('id', opts.userId);
  if (error) throw new Error(error.message);
}
