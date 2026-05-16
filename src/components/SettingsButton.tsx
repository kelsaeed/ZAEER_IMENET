'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useSettings } from '@/hooks/useSettings';

// Heavy panel — only pulled in when the user actually opens it.
const SettingsPanel = dynamic(() => import('@/components/SettingsPanel'), { ssr: false });

interface Props {
  /** 'fixed'  → pinned to a top corner (for pages that reserve the
   *              corners, like the home & match screens).
   *  'inline' → a normal pill button you drop into an existing header
   *              row, so it never collides with a back/menu link. */
  variant?: 'fixed' | 'inline';
  /** Only used by the fixed variant. 'start' = inline-start corner
   *  (left in LTR / right in RTL). */
  side?: 'start' | 'end';
}

/** Self-contained settings entrypoint: the ⚙️ button plus the panel and
 *  its open/close state. Drop this on any page so users can change
 *  theme / language there too — the gear used to only exist on the home
 *  and match screens, leaving the tutorial, store, puzzle, lobby, etc.
 *  with no way to switch language or theme. */
export default function SettingsButton({ variant = 'fixed', side = 'start' }: Props) {
  const { theme, isRTL, t } = useSettings();
  const [open, setOpen] = useState(false);

  if (variant === 'inline') {
    // Circular icon button sized to match NotificationBell / AuthBadge so
    // it sits cleanly inside an existing top-bar cluster or header row.
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          aria-label={t('settings.title')}
          title={t('settings.title')}
          className="rounded-full h-10 w-10 inline-flex items-center justify-center text-lg transition-transform hover:scale-105 shrink-0"
          style={{
            background: theme.panelBg,
            border: `1px solid ${theme.panelBorder}`,
            color: theme.textPrimary,
          }}
        >
          <span aria-hidden>⚙️</span>
        </button>
        {open && <SettingsPanel onClose={() => setOpen(false)} />}
      </>
    );
  }

  // 'start' → left in LTR / right in RTL. 'end' is the mirror.
  const startIsLeft = !isRTL;
  const corner = side === 'start'
    ? (startIsLeft ? 'left' : 'right')
    : (startIsLeft ? 'right' : 'left');

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t('settings.title')}
        className="fixed top-3 z-30 rounded-full text-xl flex items-center justify-center transition-transform hover:scale-110"
        style={{
          [corner]: 12,
          width: 40, height: 40,
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
          color: theme.textPrimary,
        } as React.CSSProperties}
      >
        ⚙️
      </button>
      {open && <SettingsPanel onClose={() => setOpen(false)} />}
    </>
  );
}
