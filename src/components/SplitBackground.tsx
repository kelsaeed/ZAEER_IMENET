'use client';
import { usePlayerThemes } from '@/hooks/usePlayerThemes';

/** Full-viewport background that paints the page in two halves — top
 *  half = player 2's theme, bottom half = player 1's — so the split
 *  carries through even when the board is centred and surrounded by
 *  empty space. Sits behind everything (z=-10) and never absorbs
 *  pointer events. Falls back to a single bg gradient when both
 *  players share the viewer's theme (single-player flows).
 *
 *  Why explicit 100vw / 100dvh and not `inset: 0`: the page reserves
 *  a stable scrollbar gutter on `<html>` (so layout doesn't jump
 *  when content grows past the fold). That gutter narrows the body's
 *  box, and `inset: 0` is relative to body, so it left a thin dark
 *  stripe of body-bg showing through on the right edge in PC view.
 *  Sizing in viewport units pins the bg to the actual viewport
 *  including the gutter; `pointerEvents: none` keeps it from ever
 *  absorbing taps. */
const fullViewportStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100dvh',
  // Fallback for older browsers without dvh support.
  minHeight: '100vh',
  zIndex: -10,
  pointerEvents: 'none',
};

export default function SplitBackground() {
  const themes = usePlayerThemes();
  const sameTheme = themes.p1.id === themes.p2.id;

  if (sameTheme) {
    return (
      <div
        aria-hidden
        style={{
          ...fullViewportStyle,
          background: themes.viewer.bgGradient,
        }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className="flex flex-col"
      style={fullViewportStyle}
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
