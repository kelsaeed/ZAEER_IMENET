'use client';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';
import { useUser } from '@/hooks/useUser';

/** Floating bar that appears whenever the user is previewing a theme
 *  from the store. Lets them stop the preview (revert to their saved
 *  theme) or equip the previewed theme outright. The actual equip
 *  decision (claim free vs. owned vs. paid) happens on the store page
 *  itself — this banner just routes back there. Mounted once at the
 *  layout level so the preview signal follows the user across pages. */
export default function PreviewBanner() {
  const { previewThemeId, setPreviewThemeId, themeId, setThemeId, theme, t, themes, isRTL } = useSettings();
  const { profile, ownedThemeIds } = useUser();
  const isAdmin = !!profile?.is_admin;

  if (!previewThemeId) return null;
  // Don't show the banner when the preview matches the saved theme —
  // there's nothing to revert to.
  if (previewThemeId === themeId) return null;

  const previewing = themes.find(t => t.id === previewThemeId);
  const previewName = previewing?.name ?? previewThemeId;
  const canEquipDirectly = isAdmin || ownedThemeIds.has(previewThemeId);

  function stop() {
    setPreviewThemeId(null);
  }

  function equipNow() {
    if (!canEquipDirectly) return;
    setThemeId(previewThemeId!);
    setPreviewThemeId(null);
  }

  return (
    <AnimatePresence>
      <motion.div
        key="preview-banner"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.22 }}
        dir={isRTL ? 'rtl' : 'ltr'}
        className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 rounded-full text-sm shadow-2xl"
        style={{
          background: theme.panelBg,
          border: `1px solid ${theme.p1AccentBorder}`,
          color: theme.textPrimary,
          backdropFilter: 'blur(8px)',
          maxWidth: 'calc(100vw - 24px)',
        }}
      >
        <span className="font-semibold whitespace-nowrap">
          👁 {t('preview.label')} <span style={{ color: theme.p1Color }}>{previewName}</span>
        </span>
        {canEquipDirectly ? (
          <button
            onClick={equipNow}
            className="rounded-full px-3 py-1 text-xs font-bold transition-transform hover:scale-105"
            style={{
              background: theme.buttonRotateBg,
              border: `1px solid ${theme.buttonRotateBorder}`,
              color: theme.buttonRotateText,
            }}
          >
            {t('preview.equip')}
          </button>
        ) : (
          <Link
            href="/store"
            className="rounded-full px-3 py-1 text-xs font-bold transition-transform hover:scale-105"
            style={{
              background: theme.buttonRotateBg,
              border: `1px solid ${theme.buttonRotateBorder}`,
              color: theme.buttonRotateText,
            }}
          >
            {t('preview.openStore')}
          </Link>
        )}
        <button
          onClick={stop}
          className="rounded-full w-7 h-7 inline-flex items-center justify-center text-xs"
          style={{
            background: theme.buttonBg,
            border: `1px solid ${theme.buttonBorder}`,
            color: theme.textPrimary,
          }}
          aria-label={t('preview.stop')}
          title={t('preview.stop')}
        >
          ✕
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
