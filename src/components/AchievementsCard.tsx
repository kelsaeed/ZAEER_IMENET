'use client';
import { useEffect, useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { ACHIEVEMENTS } from '@/game/achievements';
import { getUnlocked, type UnlockedMap } from '@/lib/achievements';
import { syncAchievements } from '@/lib/supabase/achievements';

/** Profile section listing every achievement with its unlocked/locked state.
 *  Reads after mount to avoid an SSR/CSR hydration mismatch. When a `userId`
 *  is given it syncs with the database (cross-device); otherwise it shows the
 *  local set only. */
export default function AchievementsCard({ userId }: { userId?: string }) {
  const { theme } = useSettings();
  const [unlocked, setUnlocked] = useState<UnlockedMap>({});
  useEffect(() => {
    if (userId) {
      let mounted = true;
      void syncAchievements(userId).then((m) => { if (mounted) setUnlocked(m); });
      return () => { mounted = false; };
    }
    setUnlocked(getUnlocked());
  }, [userId]);

  const count = Object.keys(unlocked).length;
  const total = ACHIEVEMENTS.length;

  return (
    <div className="rounded-xl p-4 mb-5" style={{ background: theme.panelBg, border: `1px solid ${theme.panelBorder}` }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-base font-bold">🏆 Achievements</span>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-bold"
          style={{ background: theme.p1AccentBg, border: `1px solid ${theme.p1AccentBorder}`, color: theme.p1Color }}
        >
          {count} / {total}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {ACHIEVEMENTS.map((a) => {
          const isUnlocked = !!unlocked[a.id];
          return (
            <div
              key={a.id}
              title={a.description}
              className="flex items-center gap-2 rounded-lg p-2"
              style={{
                background: isUnlocked ? theme.inputBg : 'transparent',
                border: `1px solid ${isUnlocked ? theme.p1AccentBorder : theme.buttonBorder}`,
                opacity: isUnlocked ? 1 : 0.45,
              }}
            >
              <span
                className="text-xl shrink-0"
                aria-hidden
                style={{ filter: isUnlocked ? 'none' : 'grayscale(1)' }}
              >
                {a.emoji}
              </span>
              <div className="min-w-0">
                <div
                  className="text-xs font-bold truncate"
                  style={{ color: isUnlocked ? theme.textPrimary : theme.textMuted }}
                >
                  {a.title}
                </div>
                <div className="text-[10px] opacity-70 truncate">{isUnlocked ? a.description : 'Locked'}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
