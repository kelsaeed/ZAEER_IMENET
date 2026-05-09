'use client';
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Google Drive file ID for the story video. The file must be shared
   *  with "Anyone with the link" so the embedded preview can play. */
  driveFileId?: string;
}

/**
 * Full-screen story video popup that embeds a Google Drive video via
 * an iframe. Hosting the video on Drive keeps the repo small and avoids
 * GitHub's HTTP push timeouts on large binary uploads.
 *
 * - The user can dismiss the popup at any time using the Skip Story
 *   button, the corner ✕, by clicking the dark backdrop, or by pressing
 *   Escape.
 * - We can't auto-close on video-end here (Google Drive's iframe doesn't
 *   emit a finished event), so the explicit Skip button is the primary
 *   way to dismiss.
 */
export default function StoryModal({
  open,
  onClose,
  driveFileId = '1IL-Kor_lWIrD--w3vT4tp9CZxXwYadJU',
}: Props) {
  const { theme, t, isRTL } = useSettings();

  // Esc-to-close. Bound only while the modal is open to avoid leaking
  // listeners across the rest of the app.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Translation fallbacks — these keys may not exist yet, so we resolve
  // them and use sensible defaults if they come back as the raw key.
  const skipLabel = (() => {
    const v = t('story.skip');
    return v && v !== 'story.skip' ? v : 'Skip Story';
  })();
  const closeAria = (() => {
    const v = t('story.close');
    return v && v !== 'story.close' ? v : 'Close story';
  })();

  // Google Drive's preview embed. The URL has to be /preview (not /view)
  // so the player works inside an iframe.
  const embedSrc = `https://drive.google.com/file/d/${driveFileId}/preview`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="story-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
          style={{
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(6px)',
          }}
          // Click outside the video to dismiss.
          onClick={onClose}
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          <motion.div
            key="story-frame"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="relative w-full max-w-4xl rounded-2xl overflow-hidden"
            style={{
              background: '#000',
              border: `1px solid ${theme.panelBorder}`,
              boxShadow: `0 20px 60px ${theme.p1Color}40`,
            }}
            // Stop the click from bubbling to the backdrop close handler.
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close (✕) — top-right corner, always visible. */}
            <button
              type="button"
              onClick={onClose}
              aria-label={closeAria}
              className="absolute top-3 z-10 rounded-full w-9 h-9 flex items-center justify-center text-base font-bold transition-transform hover:scale-110"
              style={{
                [isRTL ? 'left' : 'right']: 12,
                background: 'rgba(0,0,0,0.65)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.25)',
              } as React.CSSProperties}
            >
              ✕
            </button>

            {/* Responsive 16:9 wrapper for the iframe. Padding-top trick
                keeps the aspect ratio without needing the new `aspect-ratio`
                CSS property (which older browsers may not support). */}
            <div
              className="relative w-full bg-black"
              style={{ paddingTop: '56.25%' }}
            >
              <iframe
                src={embedSrc}
                title="Story video"
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
                style={{ border: 0 }}
              />
            </div>

            {/* Skip Story — explicit, labelled CTA below the video so
                it's hard to miss even on mobile where the corner ✕ can
                be small. */}
            <div className="flex justify-center p-3 sm:p-4" style={{ background: '#000' }}>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 rounded-full text-sm sm:text-base font-bold transition-transform hover:scale-105 active:scale-95"
                style={{
                  background: theme.buttonRotateBg,
                  border: `1px solid ${theme.buttonRotateBorder}`,
                  color: theme.buttonRotateText,
                  boxShadow: `0 4px 14px ${theme.buttonRotateBorder}`,
                }}
              >
                ⏭ {skipLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
