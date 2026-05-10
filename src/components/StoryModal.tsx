'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';

interface Props {
  open: boolean;
  onClose: () => void;
  driveFileId?: string;
}

export default function StoryModal({
  open,
  onClose,
  driveFileId = '1IL-Kor_lWIrD--w3vT4tp9CZxXwYadJU',
}: Props) {
  const { theme, t, isRTL } = useSettings();

  const [shouldPreload, setShouldPreload] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ric = (window as unknown as { requestIdleCallback?: typeof window.requestIdleCallback })
      .requestIdleCallback;
    let handle: number;
    if (ric) {
      handle = ric(() => setShouldPreload(true), { timeout: 2000 }) as unknown as number;
    } else {
      handle = window.setTimeout(() => setShouldPreload(true), 600);
    }
    return () => {
      const cancel = (window as unknown as { cancelIdleCallback?: (h: number) => void })
        .cancelIdleCallback;
      if (cancel) cancel(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const skipLabel = (() => {
    const v = t('story.skip');
    return v && v !== 'story.skip' ? v : 'Skip Story';
  })();

  const embedSrc = `https://drive.google.com/file/d/${driveFileId}/preview?autoplay=1`;

  return (
    <>
      {shouldPreload && !open && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: 'none',
            overflow: 'hidden',
            top: -9999,
            left: -9999,
          }}
        >
          <iframe
            src={`https://drive.google.com/file/d/${driveFileId}/preview`}
            title="Story preload"
            tabIndex={-1}
            className="w-full h-full"
            style={{ border: 0 }}
          />
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            key="story-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-3 py-4 sm:p-6"
            style={{
              background:
                'radial-gradient(circle at center, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.25) 70%, rgba(0,0,0,0.45) 100%)',
              backdropFilter: 'blur(18px) saturate(160%)',
              WebkitBackdropFilter: 'blur(18px) saturate(160%)',
              minHeight: '100dvh',
            }}
            onClick={onClose}
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            <motion.div
              key="story-card"
              initial={{ scale: 0.92, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 12 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex flex-col items-stretch"
              style={{
                filter: `drop-shadow(0 0 26px ${theme.p1Color}99) drop-shadow(0 0 80px ${theme.selectedRing}55)`,
                width: 'min(92vw, 80vh, 520px)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="relative rounded-2xl sm:rounded-3xl overflow-hidden"
                style={{
                  aspectRatio: '1 / 1',
                  padding: 4,
                  background: `linear-gradient(135deg, ${theme.p1Color}55 0%, rgba(255,255,255,0.08) 50%, ${theme.selectedRing}55 100%)`,
                  backdropFilter: 'blur(14px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(14px) saturate(180%)',
                  border: `1px solid rgba(255,255,255,0.22)`,
                  boxShadow: `0 18px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.25)`,
                }}
              >
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

                  <div
                    aria-hidden
                    className="absolute top-0 left-0 right-0 z-10 pointer-events-none"
                    style={{
                      height: 56,
                      background:
                        'linear-gradient(180deg, #000 0%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0) 100%)',
                    }}
                  />
                </div>

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

              <div className="mt-3 sm:mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center gap-2 rounded-full font-bold transition-transform hover:scale-105 active:scale-95"
                  style={{
                    minWidth: 200,
                    padding: '13px 24px',
                    fontSize: 15,
                    background: `linear-gradient(135deg, ${theme.p1Color}, ${theme.selectedRing})`,
                    color: '#000',
                    border: 'none',
                    boxShadow: `0 6px 22px ${theme.p1Color}99, 0 0 0 1px rgba(255,255,255,0.18) inset`,
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
    </>
  );
}