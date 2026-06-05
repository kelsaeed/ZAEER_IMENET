// Rank tiers derived from a player's rating. Pure + shared so the profile
// hero chip, the rank card, and anywhere else that shows a rank stay in
// lockstep (the thresholds used to be duplicated inline on the profile page).

export interface RankTier {
  /** Minimum rating required to hold this tier. */
  min: number;
  emoji: string;
  label: string;
}

export const RANK_TIERS: readonly RankTier[] = [
  { min: 0, emoji: '🌱', label: 'Newcomer' },
  { min: 1050, emoji: '🛡️', label: 'Defender' },
  { min: 1200, emoji: '⚔️', label: 'Warrior' },
  { min: 1400, emoji: '🦁', label: 'Lion Tamer' },
  { min: 1600, emoji: '👑', label: 'Throne Holder' },
];

export interface RankInfo {
  tier: RankTier;
  /** The next tier up, or null at the top. */
  next: RankTier | null;
  /** 0..1 progress from this tier's floor toward the next tier (1 at the top). */
  progress: number;
  /** Rating points still needed to reach the next tier (0 at the top). */
  toNext: number;
}

export function rankFor(rating: number): RankInfo {
  let idx = 0;
  for (let i = 0; i < RANK_TIERS.length; i++) {
    if (rating >= RANK_TIERS[i].min) idx = i;
  }
  const tier = RANK_TIERS[idx];
  const next = RANK_TIERS[idx + 1] ?? null;
  const progress = next ? Math.min(1, Math.max(0, (rating - tier.min) / (next.min - tier.min))) : 1;
  const toNext = next ? Math.max(0, next.min - rating) : 0;
  return { tier, next, progress, toNext };
}
