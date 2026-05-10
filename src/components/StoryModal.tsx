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
 * - No loading screen: the iframe is rendered immediately and the
 *   surrounding glow is the only visible "wait" state.
 * - Autoplay is requested via the Drive URL (`?autoplay=1`). Some
 *   browsers may still require a single tap because of their autoplay
 *   policies; Drive falls back to its own play button in that case.
 * - Transparent backdrop: only a soft vignette dim — the home-page
 *   animations remain visible and animated behind the popup.
 * - Skip Story / corner ✕ / click-outside / Esc all dismiss.
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
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
          // Soft vignette only — the home-page animations stay visible
          // through the gap, which is exactly what the brief asked for.
          style={{
            background:
              'radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0.35) 80%, rgba(0,0,0,0.55) 100%)',
          }}
          onClick={onClose}
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          {/* Floating square card — outer wrapper carries the pulsing
              colored glow so the card looks like it's lit from behind. */}
          <motion.div
            key="story-card"
            initial={{ scale: 0.9, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 12 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
            style={{
              filter: `drop-shadow(0 0 30px ${theme.p1Color}99) drop-shadow(0 0 90px ${theme.selectedRing}55)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="relative rounded-3xl overflow-hidden"
              style={{
                // Square — capped to whichever of the viewport's
                // dimensions is smaller, so the card always fits.
                width: 'min(92vw, 80vh, 560px)',
                height: 'min(92vw, 80vh, 560px)',
                background: '#000',
                border: `2px solid ${theme.p1Color}`,
                boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.08)`,
              }}
            >
              {/* The Drive embed — rendered immediately at full opacity
                  so there's no visible loading screen swap. While it's
                  fetching, the user just sees the dark card with the
                  glowing border. */}
              <iframe
                src={embedSrc}
                title="Story video"
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
                style={{ border: 0, background: '#000' }}
              />

              {/* Close (✕) — top corner, floats above the iframe. */}
              <button
                type="button"
                onClick={onClose}
                aria-label={closeAria}
                className="absolute top-3 z-10 rounded-full w-9 h-9 inline-flex items-center justify-center text-sm font-bold transition-transform hover:scale-110 active:scale-95"
                style={{
                  [isRTL ? 'left' : 'right']: 12,
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.3)',
                  backdropFilter: 'blur(6px)',
                }}
              >
                ✕
              </button>

              {/* Skip Story — floats over the bottom of the iframe on a
                  soft gradient so it's always reachable without taking
                  space away from the video. */}
              <div
                className="absolute bottom-0 left-0 right-0 z-10 flex justify-center px-4 pb-4 pt-10"
                style={{
                  background:
                    'linear-gradient(0deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)',
                  pointerEvents: 'none',
                }}
              >
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-transform hover:scale-105 active:scale-95"
                  style={{
                    background: `linear-gradient(135deg, ${theme.p1Color}, ${theme.selectedRing})`,
                    color: '#000',
                    border: 'none',
                    boxShadow: `0 6px 20px ${theme.p1Color}88, 0 0 0 1px rgba(255,255,255,0.15) inset`,
                    pointerEvents: 'auto',
                  }}
                >
                  <span aria-hidden>⏭</span>
                  {skipLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
