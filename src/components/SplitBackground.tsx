'use client';
import { usePlayerThemes } from '@/hooks/usePlayerThemes';

/** Full-viewport background painted in the LOCAL viewer's theme only.
 *  Earlier versions of this component split the page into two halves
 *  (one per player) but that read as visual noise — every viewer
 *  effectively saw a different colour above and below the board. The
 *  premium per-player decor moved onto the board cells themselves
 *  (see <BoardDecor/>), so this layer just paints one solid gradient
 *  for the local viewer.
 *
 *  Why explicit 100vw / 100dvh and not `inset: 0`: the page reserves
 *  a stable scrollbar gutter on `<html>` (so layout doesn't jump
 *  when content grows past the fold). That gutter narrows the body's
 *  box, and `inset: 0` is relative to body, so it left a thin dark
 *  stripe of body-bg showing through on the right edge in PC view.
 *  Sizing in viewport units pins the bg to the actual viewport
 *  including the gutter; `pointerEvents: none` keeps it from ever
 *  absorbing taps. */
export default function SplitBackground() {
  const themes = usePlayerThemes();
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100dvh',
        minHeight: '100vh',
        zIndex: -10,
        pointerEvents: 'none',
        background: themes.viewer.bgGradient,
      }}
    />
  );
}
