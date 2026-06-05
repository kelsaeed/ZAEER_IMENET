'use client';
// Client-side persistence for unlocked achievements. Kept in localStorage so
// it works offline and needs no database — each unlock records its date. (A
// future upgrade can sync this to the profile row for cross-device + social
// visibility; the UI reads through these helpers either way.)
import { ACHIEVEMENTS } from '@/game/achievements';

const KEY = 'zaeer.achievements';
const VALID = new Set(ACHIEVEMENTS.map((a) => a.id));

/** id → ISO date it was unlocked. */
export type UnlockedMap = Record<string, string>;

export function getUnlocked(): UnlockedMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as UnlockedMap;
    // Drop ids that are no longer in the catalogue.
    const out: UnlockedMap = {};
    for (const [id, when] of Object.entries(parsed)) {
      if (VALID.has(id) && typeof when === 'string') out[id] = when;
    }
    return out;
  } catch {
    return {};
  }
}

/** Unlock the given ids and return only the ones that were NEW, so the caller
 *  can toast just the fresh unlocks. Already-unlocked ids are ignored. */
export function unlock(ids: string[]): string[] {
  if (typeof window === 'undefined' || ids.length === 0) return [];
  const current = getUnlocked();
  const now = new Date().toISOString();
  const fresh: string[] = [];
  for (const id of ids) {
    if (VALID.has(id) && !current[id]) {
      current[id] = now;
      fresh.push(id);
    }
  }
  if (fresh.length === 0) return [];
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage blocked / full — the unlock just won't persist */
  }
  return fresh;
}

/** Merge a remote (database) map into the local store — the earliest unlock
 *  date wins for each id — and persist + return the merged result. Used by the
 *  DB sync so unlocks earned on another device show up here too. */
export function mergeUnlocked(remote: UnlockedMap): UnlockedMap {
  const local = getUnlocked();
  const merged: UnlockedMap = {};
  for (const [id, when] of Object.entries(remote)) {
    if (VALID.has(id) && typeof when === 'string') merged[id] = when;
  }
  for (const [id, when] of Object.entries(local)) {
    if (!merged[id] || when < merged[id]) merged[id] = when;
  }
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(KEY, JSON.stringify(merged));
    } catch {
      /* ignore */
    }
  }
  return merged;
}
