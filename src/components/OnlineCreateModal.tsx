'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';
import type { TimeControl } from '@/game/types';
import type { GameMode } from '@/lib/supabase/games';
import TimerSettings from './TimerSettings';

interface Props {
  open: boolean;
  onClose: () => void;
  /** When set, the modal opens already on this mode and the toggle is
   *  hidden (used when launching from the Friends tab challenge button). */
  forceMode?: GameMode;
  /** Default async timer (kept for parity even though async is always
   *  untimed — keeps the surrounding logic uniform). */
  defaultMode?: GameMode;
  defaultTimeControl?: TimeControl;
  /** "Quick Match" button — uses the chosen mode + clock. Pass undefined
   *  to hide it (e.g. when used from Friends → Challenge, where Quick
   *  Match would be redundant). */
  onQuickMatch?: (opts: { mode: GameMode; timeControl: TimeControl }) => void;
  /** "Create" — opens a public or private room with the chosen settings. */
  onCreate: (opts: { mode: GameMode; timeControl: TimeControl; isPublic: boolean }) => void;
}

const STORAGE_KEY = 'zaeer.onlineCreateModal.v1';

interface OnlineCreateChoice {
  mode: GameMode;
  timeControl: TimeControl;
}

const DEFAULT_CHOICE: OnlineCreateChoice = {
  mode: 'live',
  timeControl: { kind: 'none' },
};

/** Modal shown when the player taps Quick Match / Play with Friend in the
 *  lobby. They pick live-vs-async, optional timer, then either start a
 *  Quick Match (search-or-create) or open a public/private room. */
export default function OnlineCreateModal({
  open, onClose, forceMode, defaultMode, defaultTimeControl,
  onQuickMatch, onCreate,
}: Props) {
  const { theme, t, isRTL } = useSettings();
  const [choice, setChoice] = useState<OnlineCreateChoice>(() => ({
    mode: forceMode ?? defaultMode ?? DEFAULT_CHOICE.mode,
    timeControl: defaultTimeControl ?? DEFAULT_CHOICE.timeControl,
  }));

  // Hydrate the saved choice once.
  useEffect(() => {
    if (forceMode) return;        // explicit caller override wins
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as OnlineCreateChoice;
      if (!parsed) return;
      const mode: GameMode = parsed.mode === 'async' ? 'async' : 'live';
      const tc: TimeControl = mode === 'async'
        ? { kind: 'none' }     // async is always untimed
        : (parsed.timeControl?.kind === 'clock' ? parsed.timeControl : { kind: 'none' });
      setChoice({ mode, timeControl: tc });
    } catch {
      /* ignore */
    }
  }, [forceMode]);

  // Persist on change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choice)); } catch { /* ignore */ }
  }, [choice]);

  // If the caller forces a mode (e.g. async-only from Friends tab),
  // squash any timer config to untimed when the mode is async.
  useEffect(() => {
    if (choice.mode === 'async' && choice.timeControl.kind !== 'none') {
      setChoice(c => ({ ...c, timeControl: { kind: 'none' } }));
    }
  }, [choice.mode, choice.timeControl.kind]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const setMode = (m: GameMode) => {
    if (forceMode) return;
    setChoice(c => ({
      mode: m,
      timeControl: m === 'async' ? { kind: 'none' } : c.timeControl,
    }));
  };

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
                <div className="text-lg font-extrabold" style={{ color: theme.p1Color }}>🌐 {t('online.createTitle')}</div>
                <div className="text-xs opacity-65 mt-0.5">{t('online.createSubtitle')}</div>
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
              {!forceMode && (
                <div
                  className="rounded-xl p-3"
                  style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}
                >
                  <div className="text-xs font-bold uppercase tracking-wider opacity-70 mb-2">Mode</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode('live')}
                      className="rounded-lg p-2.5 text-start transition-all"
                      style={{
                        background: choice.mode === 'live' ? theme.p1AccentBg : theme.inputBg,
                        border: `1px solid ${choice.mode === 'live' ? theme.p1Color : theme.buttonBorder}`,
                        color: theme.textPrimary,
                      }}
                    >
                      <div className="text-sm font-bold mb-0.5">{t('online.live')}</div>
                      <div className="text-[11px] opacity-70 leading-snug">{t('online.liveDesc')}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('async')}
                      className="rounded-lg p-2.5 text-start transition-all"
                      style={{
                        background: choice.mode === 'async' ? theme.p1AccentBg : theme.inputBg,
                        border: `1px solid ${choice.mode === 'async' ? theme.p1Color : theme.buttonBorder}`,
                        color: theme.textPrimary,
                      }}
                    >
                      <div className="text-sm font-bold mb-0.5">{t('online.async')}</div>
                      <div className="text-[11px] opacity-70 leading-snug">{t('online.asyncDesc')}</div>
                    </button>
                  </div>
                </div>
              )}

              <TimerSettings
                value={choice.timeControl}
                onChange={tc => setChoice(c => ({ ...c, timeControl: tc }))}
                disabled={choice.mode === 'async'}
                disabledNote={t('online.asyncTimerNote')}
              />

              <div className="flex flex-col gap-2">
                {onQuickMatch && (
                  <button
                    type="button"
                    onClick={() => onQuickMatch({ mode: choice.mode, timeControl: choice.timeControl })}
                    className="rounded-xl py-3 px-4 font-extrabold text-sm transition-transform hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: theme.buttonRotateBg,
                      border: `1px solid ${theme.buttonRotateBorder}`,
                      color: theme.buttonRotateText,
                    }}
                  >
                    🎯 {t('online.quickMatch')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onCreate({ mode: choice.mode, timeControl: choice.timeControl, isPublic: true })}
                  className="rounded-xl py-2.5 px-4 font-bold text-sm"
                  style={{
                    background: theme.panelBg,
                    border: `1px solid ${theme.panelBorder}`,
                    color: theme.textPrimary,
                  }}
                >
                  🌍 {t('online.public')}
                </button>
                <button
                  type="button"
                  onClick={() => onCreate({ mode: choice.mode, timeControl: choice.timeControl, isPublic: false })}
                  className="rounded-xl py-2.5 px-4 font-bold text-sm"
                  style={{
                    background: theme.panelBg,
                    border: `1px solid ${theme.panelBorder}`,
                    color: theme.textPrimary,
                  }}
                >
                  👥 {t('online.private')}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
