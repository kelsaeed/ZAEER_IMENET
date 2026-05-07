'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';
import { AI_LEVEL_META } from '@/game/ai';
import type { AiLevel, TimeControl } from '@/game/types';
import TimerSettings from './TimerSettings';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Caller starts the game with the chosen mode + clock. Pass null for
   *  pass-and-play, or an AI level for vs-bot. */
  onStart: (aiLevel: AiLevel | null, timeControl: TimeControl) => void;
}

const STORAGE_KEY = 'zaeer.offlineModal.v1';

interface OfflineChoice {
  mode: 'local' | AiLevel;
  timeControl: TimeControl;
}

const DEFAULT_CHOICE: OfflineChoice = {
  mode: 'local',
  timeControl: { kind: 'none' },
};

/** Modal that pops when the player taps the "Offline Game" hero button on
 *  the start screen. Shows the timer settings at the top and four mode
 *  cards underneath: local pass-and-play + three AI difficulties. The
 *  last choice is persisted so a player who re-opens the modal lands on
 *  whatever they picked last. */
export default function OfflineGameModal({ open, onClose, onStart }: Props) {
  const { theme, t, isRTL } = useSettings();
  const [choice, setChoice] = useState<OfflineChoice>(DEFAULT_CHOICE);

  // Hydrate the saved choice on first mount so the toggle/preset land
  // wherever the player left them.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as OfflineChoice;
      if (parsed && (parsed.mode === 'local' || parsed.mode === 'butterfly' || parsed.mode === 'monkey' || parsed.mode === 'lion')) {
        setChoice({
          mode: parsed.mode,
          timeControl: parsed.timeControl?.kind === 'clock'
            ? parsed.timeControl
            : { kind: 'none' },
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Persist on every change. Cheap; choice is tiny.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choice)); } catch { /* ignore */ }
  }, [choice]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const launch = (mode: OfflineChoice['mode']) => {
    setChoice(c => ({ ...c, mode }));
    onStart(mode === 'local' ? null : mode, choice.timeControl);
  };

  const MODE_BUTTONS: { value: OfflineChoice['mode']; emoji: string; labelKey: string }[] = [
    { value: 'local',     emoji: '👥', labelKey: 'mode.local' },
    { value: 'butterfly', emoji: AI_LEVEL_META.butterfly.emoji, labelKey: 'mode.aiEasy' },
    { value: 'monkey',    emoji: AI_LEVEL_META.monkey.emoji,    labelKey: 'mode.aiMedium' },
    { value: 'lion',      emoji: AI_LEVEL_META.lion.emoji,      labelKey: 'mode.aiHard' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-40 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={onClose}
        >
          <motion.div
            dir={isRTL ? 'rtl' : 'ltr'}
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
            className="rounded-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            style={{
              background: theme.bgGradient,
              border: `1px solid ${theme.panelBorder}`,
              color: theme.textPrimary,
              boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
            }}
          >
            <div className="px-5 py-4 flex items-center justify-between border-b" style={{ borderColor: theme.panelBorder }}>
              <div>
                <div className="text-lg font-extrabold" style={{ color: theme.p1Color }}>⚔️ {t('offline.title')}</div>
                <div className="text-xs opacity-65 mt-0.5">{t('offline.subtitle')}</div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-full w-8 h-8 inline-flex items-center justify-center text-base opacity-70 hover:opacity-100"
                style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, color: theme.textPrimary }}
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 overflow-y-auto flex flex-col gap-4">
              <TimerSettings
                value={choice.timeControl}
                onChange={tc => setChoice(c => ({ ...c, timeControl: tc }))}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {MODE_BUTTONS.map(opt => (
                  <motion.button
                    key={opt.value}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => launch(opt.value)}
                    className="rounded-xl p-3 text-start transition-all flex items-center gap-3"
                    style={{
                      background: theme.panelBg,
                      border: `1px solid ${theme.panelBorder}`,
                      color: theme.textPrimary,
                    }}
                  >
                    <span className="text-2xl shrink-0" aria-hidden>{opt.emoji}</span>
                    <span className="text-sm font-bold">{t(opt.labelKey)}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
