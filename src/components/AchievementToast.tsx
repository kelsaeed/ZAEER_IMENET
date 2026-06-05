'use client';
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '@/hooks/useSettings';
import { ACHIEVEMENTS, type Achievement } from '@/game/achievements';

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Resolve achievement ids to their definitions, dropping unknown ids. */
export function achievementsById(ids: string[]): Achievement[] {
  return ids.map((id) => BY_ID.get(id)).filter((a): a is Achievement => !!a);
}

/** Floating toast that celebrates freshly-unlocked achievements. Auto-dismisses
 *  after a few seconds. Centred via a flex wrapper (not a transform) so
 *  framer-motion's y animation can't fight the horizontal centring. */
export default function AchievementToast({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const { theme } = useSettings();
  const items = achievementsById(ids);

  useEffect(() => {
    if (items.length === 0) return;
    const t = setTimeout(onDone, 4200);
    return () => clearTimeout(t);
  }, [ids, items.length, onDone]);

  return (
    <AnimatePresence>
      {items.length > 0 && (
        <div className="fixed bottom-6 inset-x-0 z-40 flex justify-center px-3 pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.3 }}
            onClick={onDone}
            className="pointer-events-auto cursor-pointer rounded-2xl p-3 shadow-2xl"
            style={{
              background: theme.panelBg,
              border: `1px solid ${theme.p1Color}`,
              color: theme.textPrimary,
              maxWidth: 'min(100vw - 24px, 22rem)',
              boxShadow: `0 14px 38px ${theme.p1Color}40`,
            }}
            role="status"
          >
            <div className="text-xs font-bold mb-1.5 flex items-center gap-1.5" style={{ color: theme.p1Color }}>
              <span aria-hidden>🏆</span>
              {items.length === 1 ? 'Achievement unlocked!' : `${items.length} achievements unlocked!`}
            </div>
            <div className="flex flex-col gap-1.5">
              {items.map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <span className="text-xl shrink-0" aria-hidden>{a.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{a.title}</div>
                    <div className="text-xs opacity-70 truncate">{a.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
