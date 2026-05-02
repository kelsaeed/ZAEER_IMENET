'use client';
import { useSettings } from '@/hooks/useSettings';

interface Props {
  url?: string | null;
  name?: string | null;
  email?: string | null;
  size?: number;
  /** Use the secondary player accent (sky/emerald/etc.) instead of the
   *  primary gold for the initial-fallback. */
  accent?: 'p1' | 'p2';
  ring?: boolean;
}

/** Shared user avatar — image when uploaded, themed initial when not.
 *  Used in AuthBadge, Profile page, friends list, lobby cards, in-match
 *  player ribbon. */
export default function Avatar({ url, name, email, size = 32, accent = 'p1', ring = false }: Props) {
  const { theme } = useSettings();
  const initial = (name ?? email ?? '?').slice(0, 1).toUpperCase();
  const bg = accent === 'p1' ? theme.p1Color : theme.p2Color;
  const ringStyle = ring ? `0 0 0 2px ${bg}, 0 0 12px ${bg}80` : 'none';

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ?? 'Avatar'}
        className="rounded-full object-cover shrink-0"
        style={{
          width: size,
          height: size,
          boxShadow: ringStyle,
          background: bg,
        }}
        onError={(e) => {
          // Fallback to initial if the image 404s.
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }

  return (
    <span
      className="rounded-full inline-flex items-center justify-center font-bold shrink-0 select-none"
      style={{
        width: size,
        height: size,
        background: bg,
        color: '#000',
        fontSize: Math.max(11, size * 0.4),
        boxShadow: ringStyle,
      }}
    >
      {initial}
    </span>
  );
}
