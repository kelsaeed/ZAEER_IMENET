'use client';
import { useEffect, useState } from 'react';
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
 * Designed to feel like a polished Instagram/TikTok-style story:
 *  - Vertical 9:16 frame (matches the source video's aspect ratio so the
 *    player isn't drowning in black bars).
 *  - Branded loading screen with an animated logo + progress shimmer
 *    while the Drive iframe is fetching.
 *  - Animated gradient glow border that pulses softly behind the frame.
 *  - Story progress bar across the top (decorative — fills in over the
 *    expected duration so the user has a sense of pacing).
 *  - Skip Story / corner ✕ / click-outside / Esc all dismiss.
 */
export default function StoryModal({
  open,
  onClose,
  driveFileId = '1IL-Kor_lWIrD--w3vT4tp9CZxXwYadJU',
}: Props) {
  const { theme, t, isRTL } = useSettings();
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // Reset the loaded flag whenever the modal closes so the next open
  // shows the loading screen again instead of an instant blank frame.
  useEffect(() => {
    if (!open) setIframeLoaded(false);
  }, [open]);

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
  const loadingLabel = (() => {
    const v = t('story.loading');
    return v && v !== 'story.loading' ? v : 'Loading story…';
  })();
  const titleLabel = (() => {
    const v = t('story.title');
    return v && v !== 'story.title' ? v : 'Zaeer Imenet · Story';
  })();

  const embedSrc = `https://drive.google.com/file/d/${driveFileId}/preview`;

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
          style={{
            background:
              'radial-gradient(circle at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.96) 100%)',
            backdropFilter: 'blur(10px)',
          }}
          onClick={onClose}
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          {/* Outer glow wrapper — sits BEHIND the frame and pulses gently
              with the player's accent color. Pure CSS animation so it
              doesn't fight framer's spring on the inner card. */}
          <motion.div
            key="story-glow"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
            className="relative"
            style={{
              filter: `drop-shadow(0 0 28px ${theme.p1Color}80) drop-shadow(0 0 80px ${theme.selectedRing}40)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* The actual story frame — capped to a tall aspect so a
                portrait video fills it nicely. Width is bounded by the
                viewport height so we never overflow vertically. */}
            <div
              className="relative rounded-3xl overflow-hidden"
              style={{
                width: 'min(92vw, calc(85vh * 9 / 16), 420px)',
                aspectRatio: '9 / 16',
                background: '#0a0a0a',
                border: `1px solid ${theme.p1AccentBorder}`,
                boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.06)`,
              }}
            >
              {/* Story progress bar — single segment that fills over the
                  approximate duration of the video. Purely decorative
                  (we can't read iframe progress) but sells the
                  Instagram-story vibe. */}
              <div
                className="absolute top-0 left-0 right-0 z-20 px-3 pt-3"
                style={{ pointerEvents: 'none' }}
              >
                <div
                  className="h-1 rounded-full overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.18)' }}
                >
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 30, ease: 'linear' }}
                    className="h-full"
                    style={{
                      background: `linear-gradient(90deg, ${theme.p1Color}, ${theme.selectedRing})`,
                    }}
                  />
                </div>
              </div>

              {/* Header bar — story title + close button. Sits on a
                  subtle gradient so it stays legible over any video
                  frame underneath. */}
              <div
                className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-6 pb-3"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)',
                  pointerEvents: 'none',
                }}
              >
                <div
                  className="flex items-center gap-2"
                  style={{ color: '#fff' }}
                >
                  <span
                    className="inline-flex items-center justify-center rounded-full"
                    style={{
                      width: 30,
                      height: 30,
                      background: `linear-gradient(135deg, ${theme.p1Color}, ${theme.selectedRing})`,
                      fontSize: 16,
                      boxShadow: `0 2px 8px ${theme.p1Color}60`,
                    }}
                    aria-hidden
                  >
                    👑
                  </span>
                  <span
                    className="text-xs sm:text-sm font-bold tracking-wide truncate"
                    style={{ maxWidth: '14rem', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
                  >
                    {titleLabel}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={closeAria}
                  className="rounded-full w-8 h-8 inline-flex items-center justify-center text-sm font-bold transition-transform hover:scale-110 active:scale-95"
                  style={{
                    background: 'rgba(0,0,0,0.55)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.3)',
                    backdropFilter: 'blur(6px)',
                    pointerEvents: 'auto',
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Branded loading screen — shown until the iframe fires
                  its load event. Uses the user's theme so it doesn't
                  clash with whatever palette they picked. */}
              <AnimatePresence>
                {!iframeLoaded && (
                  <motion.div
                    key="story-loading"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4"
                    style={{
                      background: `linear-gradient(160deg, ${theme.p1Color}1a 0%, #050505 60%, ${theme.p2Color}1a 100%)`,
                    }}
                  >
                    {/* Pulsing crown — the brand mark from the home
                        page. Gives the loader a personality instead of
                        the generic Drive spinner. */}
                    <motion.div
                      animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
                      transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                      className="text-5xl"
                      style={{
                        filter: `drop-shadow(0 0 18px ${theme.p1Color})`,
                      }}
                      aria-hidden
                    >
                      👑
                    </motion.div>

                    {/* Indeterminate progress bar with a moving gradient
                        slice — way more polished than a static spinner. */}
                    <div
                      className="relative w-40 h-1.5 rounded-full overflow-hidden"
                      style={{ background: 'rgba(255,255,255,0.12)' }}
                    >
                      <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: '200%' }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                        className="absolute top-0 bottom-0 w-1/2 rounded-full"
                        style={{
                          background: `linear-gradient(90deg, transparent, ${theme.p1Color}, ${theme.selectedRing}, transparent)`,
                        }}
                      />
                    </div>

                    <div
                      className="text-xs sm:text-sm font-semibold tracking-wide"
                      style={{ color: theme.textPrimary, opacity: 0.85 }}
                    >
                      {loadingLabel}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* The Drive embed itself. Fades in once it loads so the
                  swap from loading screen → video feels intentional. */}
              <motion.iframe
                src={embedSrc}
                title="Story video"
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
                onLoad={() => setIframeLoaded(true)}
                initial={{ opacity: 0 }}
                animate={{ opacity: iframeLoaded ? 1 : 0 }}
                transition={{ duration: 0.35 }}
                className="absolute inset-0 w-full h-full"
                style={{ border: 0, background: '#000' }}
              />

              {/* Bottom gradient + Skip Story CTA. Floats over the video
                  so it's always visible without resizing the player. */}
              <div
                className="absolute bottom-0 left-0 right-0 z-20 flex justify-center px-4 pb-4 pt-10"
                style={{
                  background:
                    'linear-gradient(0deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 100%)',
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
                    boxShadow: `0 6px 20px ${theme.p1Color}80, 0 0 0 1px rgba(255,255,255,0.15) inset`,
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
