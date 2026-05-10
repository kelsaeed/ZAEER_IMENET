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
 * Story video popup. Hosted on Google Drive (so the repo stays small)
 * and displayed in a square frame that floats above the home page —
 * the bouncing-emoji background and brand decoration stay visible
 * around the edges so the story feels like part of the experience
 * instead of a heavy modal.
 *
 * Layout decisions for mobile:
 *  - The iframe sits on its own (square) so Drive's bottom control bar
 *    has the full width to itself. The Skip Story CTA lives in a
 *    separate strip BELOW the video so users can never tap it by
 *    accident when reaching for Drive's volume / settings.
 *  - The close ✕ is enlarged and positioned just outside the video so
 *    it never overlaps the Drive player chrome.
 *  - Card sizing uses a 92vw / 80vh / 560px clamp so it fills the
 *    iPhone screen comfortably and tops out on desktop.
 *
 * Dismiss: Skip Story / corner ✕ / click-outside / Esc.
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

  // While the modal is open we lock body scroll so flicks inside the
  // popup don't accidentally scroll the home page underneath. Restored
  // on unmount and on close.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

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

  // `?autoplay=1` is honoured by Drive in most desktop browsers and on
  // Android Chrome. Mobile Safari may still defer playback until a tap
  // because of its strict autoplay policy.
  const embedSrc = `https://drive.google.com/file/d/${driveFileId}/preview?autoplay=1`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="story-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] flex items-center justify-center px-3 py-4 sm:p-6"
          // Frosted-glass backdrop — heavy blur on whatever is behind
          // (the home page emojis + gradient) plus a soft tint, so it
          // reads as glass instead of a flat overlay. The home-page
          // motion still shimmers through the blur.
          style={{
            background:
              'radial-gradient(circle at center, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.25) 70%, rgba(0,0,0,0.45) 100%)',
            backdropFilter: 'blur(18px) saturate(160%)',
            WebkitBackdropFilter: 'blur(18px) saturate(160%)',
            // Use dvh so iOS Safari's collapsing URL bar doesn't crop
            // the bottom of the popup.
            minHeight: '100dvh',
          }}
          onClick={onClose}
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          {/* Floating card. Two-row layout: square video on top, Skip
              Story strip below — completely separate from the iframe so
              Drive's control bar stays clean. */}
          <motion.div
            key="story-card"
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex flex-col items-stretch"
            style={{
              filter: `drop-shadow(0 0 26px ${theme.p1Color}99) drop-shadow(0 0 80px ${theme.selectedRing}55)`,
              // Card width drives both the square video AND the Skip
              // strip below. Clamp keeps it square-ish on portrait
              // phones without overflowing on tiny screens.
              width: 'min(92vw, 80vh, 520px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close (✕) — top-right, ABOVE the iframe so it never
                covers Drive's own UI. Enlarged for thumb-friendly taps. */}
            <button
              type="button"
              onClick={onClose}
              aria-label={closeAria}
              className="absolute -top-2 z-20 rounded-full inline-flex items-center justify-center text-base font-bold transition-transform hover:scale-110 active:scale-95"
              style={{
                [isRTL ? 'left' : 'right']: -2,
                width: 38,
                height: 38,
                // Frosted-glass orb — same vocabulary as the card so
                // the close button feels like part of the same surface.
                background: 'rgba(255,255,255,0.12)',
                color: '#fff',
                border: `1px solid rgba(255,255,255,0.35)`,
                boxShadow: [
                  `0 6px 18px rgba(0,0,0,0.5)`,
                  `inset 0 1px 0 rgba(255,255,255,0.3)`,
                  `0 0 0 2px ${theme.p1Color}33`,
                ].join(', '),
                backdropFilter: 'blur(12px) saturate(160%)',
                WebkitBackdropFilter: 'blur(12px) saturate(160%)',
              } as React.CSSProperties}
            >
              ✕
            </button>

            {/* Square video frame — frosted-glass shell wrapping the
                Drive iframe. The padding lets a thin glass border show
                around the video, and the inner inset shadows + top
                highlight sell the "real glass" look without obscuring
                the player. */}
            <div
              className="relative rounded-2xl sm:rounded-3xl overflow-hidden"
              style={{
                aspectRatio: '1 / 1',
                padding: 4,
                // Translucent gradient instead of solid colour — the
                // home-page glow shows through the edges so the card
                // reads as glass rather than a black box with a border.
                background: `linear-gradient(135deg, ${theme.p1Color}55 0%, rgba(255,255,255,0.08) 50%, ${theme.selectedRing}55 100%)`,
                backdropFilter: 'blur(14px) saturate(180%)',
                WebkitBackdropFilter: 'blur(14px) saturate(180%)',
                border: `1px solid rgba(255,255,255,0.22)`,
                boxShadow: [
                  // Outer soft shadow grounds the card
                  `0 18px 40px rgba(0,0,0,0.45)`,
                  // Inner top highlight — the "wet glass" sheen
                  `inset 0 1px 0 rgba(255,255,255,0.35)`,
                  // Inner bottom shadow — gives the glass depth
                  `inset 0 -1px 0 rgba(0,0,0,0.25)`,
                ].join(', '),
              }}
            >
              {/* Inner clip wraps the iframe in a rounded rect so the
                  glass padding around it is visible. */}
              <div
                className="relative w-full h-full rounded-xl sm:rounded-2xl overflow-hidden"
                style={{ background: '#000' }}
              >
                <iframe
                  src={embedSrc}
                  title="Story video"
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                  style={{ border: 0, background: '#000' }}
                />
              </div>

              {/* Diagonal sheen across the top-left quarter — purely
                  decorative, sells the glass effect. Pointer-events
                  none so it never blocks Drive's controls. */}
              <div
                aria-hidden
                className="absolute inset-0 rounded-2xl sm:rounded-3xl pointer-events-none"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.06) 100%)',
                  mixBlendMode: 'screen',
                }}
              />
            </div>

            {/* Skip Story strip — its own row below the video, well
                clear of Drive's bottom toolbar. Centered, full-width
                tappable area on mobile. */}
            <div className="mt-3 sm:mt-4 flex justify-center">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center gap-2 rounded-full font-bold transition-transform hover:scale-105 active:scale-95"
                style={{
                  // Wide enough to be obvious, but not full width — a
                  // pill feels more like an action than a footer.
                  minWidth: 180,
                  padding: '12px 22px',
                  fontSize: 15,
                  background: `linear-gradient(135deg, ${theme.p1Color}, ${theme.selectedRing})`,
                  color: '#000',
                  border: 'none',
                  boxShadow: `0 6px 20px ${theme.p1Color}88, 0 0 0 1px rgba(255,255,255,0.15) inset`,
                }}
              >
                <span aria-hidden style={{ fontSize: 16 }}>⏭</span>
                {skipLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}