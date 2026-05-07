'use client';
import { usePlayerThemes } from '@/hooks/usePlayerThemes';

/** Full-viewport background that paints the page in two halves — top
 *  half = player 2's theme, bottom half = player 1's — so the split
 *  carries through even when the board is centred and surrounded by
 *  empty space. Sits behind everything (z=-10) and never absorbs
 *  pointer events. Falls back to a single bg gradient when both
 *  players share the viewer's theme (single-player flows). */
export default function SplitBackground() {
  const themes = usePlayerThemes();
  const sameTheme = themes.p1.id === themes.p2.id;

  if (sameTheme) {
    return (
      <div
        aria-hidden
        className="fixed inset-0"
        style={{
          background: themes.viewer.bgGradient,
          zIndex: -10,
          pointerEvents: 'none',
        }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className="fixed inset-0 flex flex-col"
      style={{ zIndex: -10, pointerEvents: 'none' }}
    >
      <div
        style={{
          flex: 1,
          background: themes.p2.bgGradient,
        }}
      />
      <div
        style={{
          flex: 1,
          background: themes.p1.bgGradient,
        }}
      />
    </div>
  );
}
