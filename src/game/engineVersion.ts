// Engine version stamp. Bump this whenever a change in src/game/logic.ts
// or src/game/constants.ts could change a piece's legal moves, the kill
// cycle, the throne/barrier layout, or anything else that shifts whether
// a stored daily-puzzle solution still proves out.
//
// Daily puzzles compare this constant against their stored
// `engine_version`. Mismatch → the puzzle is treated as un-validated and
// the player API hides it until the re-validator script reproves it.
export const ENGINE_VERSION = '1.0.0';
