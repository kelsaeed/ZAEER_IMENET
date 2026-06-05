// Achievement definitions + pure unlock evaluation. No React and no I/O here
// so the rules stay testable in plain Node; the client store
// (src/lib/achievements.ts) is what actually persists which ids are unlocked.
import type { GameState, Player, AiLevel } from './types';
import { isThrone } from './constants';
import { createInitialState } from './initialState';

export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  description: string;
}

/** The full catalogue, in display order. */
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-win', emoji: '🏅', title: 'First Blood', description: 'Win your first match against the AI.' },
  { id: 'beat-easy', emoji: '🦋', title: 'Warmup', description: 'Beat the Easy bot.' },
  { id: 'beat-medium', emoji: '🐒', title: 'Contender', description: 'Beat the Medium bot.' },
  { id: 'beat-hard', emoji: '🦁', title: 'Giant Slayer', description: 'Beat the Hard bot.' },
  { id: 'throne', emoji: '👑', title: 'Throne Claimer', description: 'Win by reaching the central throne.' },
  { id: 'hunter', emoji: '💀', title: 'Lion Hunter', description: 'Win by eliminating both enemy Lions.' },
  { id: 'flawless', emoji: '🛡️', title: 'Flawless', description: 'Win without losing a single piece.' },
  { id: 'blitz', emoji: '⚡', title: 'Blitzkrieg', description: 'Win in 15 turns or fewer.' },
  { id: 'first-puzzle', emoji: '🧩', title: 'Puzzler', description: 'Solve your first daily puzzle.' },
  { id: 'clean-puzzle', emoji: '✨', title: 'Clean Solve', description: 'Solve a puzzle with no wrong moves.' },
  { id: 'archive-solve', emoji: '🗂️', title: 'Time Traveler', description: 'Solve a puzzle from the archive.' },
  { id: 'online-win', emoji: '🌐', title: 'Online Victory', description: 'Win a match against another player online.' },
];

const BEAT_AI: Record<AiLevel, string> = {
  butterfly: 'beat-easy',
  monkey: 'beat-medium',
  lion: 'beat-hard',
};

// How many pieces a player starts with — the baseline for the "flawless"
// (no losses) check. Computed once from a fresh initial state.
const STARTING_PIECES_PER_PLAYER = createInitialState().pieces.filter((p) => p.player === 1).length;

/** Achievement ids earned when an offline match ends. `viewerPlayer` is the
 *  human's side (1 in vs-AI). Returns the ids this result qualifies for — the
 *  caller unlocks whichever are new. Empty unless the human actually beat the
 *  AI (ranked achievements only count against a bot, not pass-and-play). */
export function earnedFromGame(state: GameState, viewerPlayer: Player): string[] {
  if (state.phase !== 'won' || state.winner !== viewerPlayer) return [];
  if (state.aiLevel == null) return [];

  const earned: string[] = ['first-win', BEAT_AI[state.aiLevel]];

  const mine = state.pieces.filter((p) => p.player === viewerPlayer);
  if (mine.length === STARTING_PIECES_PER_PLAYER) earned.push('flawless');
  if (state.turn <= 15) earned.push('blitz');

  const myLion = mine.find((p) => p.type === 'lion');
  const enemyLions = state.pieces.filter((p) => p.player !== viewerPlayer && p.type === 'lion').length;
  if (myLion && isThrone(myLion.row, myLion.col)) earned.push('throne');
  else if (enemyLions === 0) earned.push('hunter');

  return earned;
}

/** Achievement ids earned when a puzzle is solved. `isArchive` is true when
 *  the solve came from the archive (a past puzzle) rather than today's. */
export function earnedFromPuzzle(wrongCount: number, isArchive = false): string[] {
  const earned = ['first-puzzle'];
  if (wrongCount === 0) earned.push('clean-puzzle');
  if (isArchive) earned.push('archive-solve');
  return earned;
}

/** Achievement ids earned when the local player wins an online match. */
export function earnedFromOnlineWin(): string[] {
  return ['online-win'];
}
