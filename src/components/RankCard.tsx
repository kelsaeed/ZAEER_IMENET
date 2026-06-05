'use client';
import { useSettings } from '@/hooks/useSettings';
import { rankFor } from '@/game/ranks';

/** Profile card: the player's rank tier + a progress bar toward the next tier.
 *  Turns the raw ELO number into a visible sense of progression. */
export default function RankCard({
  rating,
  wins,
  losses,
  draws,
}: {
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}) {
  const { theme } = useSettings();
  const { tier, next, progress, toNext } = rankFor(rating);
  const total = wins + losses + draws;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return (
    <div
      className="rounded-xl p-4 mb-5"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${theme.p1Color} 12%, ${theme.panelBg}), ${theme.panelBg})`,
        border: `1px solid ${theme.p1AccentBorder}`,
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl shrink-0" aria-hidden>{tier.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-lg truncate" style={{ color: theme.p1Color }}>{tier.label}</div>
          <div className="text-xs opacity-75 truncate">
            ★ {rating} · {total} game{total === 1 ? '' : 's'}{total > 0 ? ` · ${winRate}% win` : ''}
          </div>
        </div>
      </div>

      {next ? (
        <>
          <div className="flex items-center justify-between text-xs opacity-80 mb-1">
            <span>{tier.emoji} {tier.label}</span>
            <span className="font-semibold" style={{ color: theme.p1Color }}>
              {toNext} pts to {next.emoji} {next.label}
            </span>
          </div>
          <div
            className="h-2.5 rounded-full overflow-hidden"
            style={{ background: theme.inputBg, border: `1px solid ${theme.buttonBorder}` }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round(progress * 100)}%`,
                background: `linear-gradient(90deg, ${theme.p1Color}, ${theme.selectedRing})`,
                transition: 'width 0.8s ease-out',
              }}
            />
          </div>
        </>
      ) : (
        <div className="text-sm font-semibold" style={{ color: theme.p1Color }}>
          👑 Top rank reached — defend the throne!
        </div>
      )}
    </div>
  );
}
